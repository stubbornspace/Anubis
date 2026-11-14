#import <Foundation/Foundation.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

// All accessors run synchronously on the calling Rust worker. Never dispatch
// filesystem work to the UI thread, and never let a Rust panic cross this ABI.
typedef int (*Access)(void *, const char *, const char *);
typedef void (*Changed)(void *);

static char *Message(NSString *text) { return strdup(text.UTF8String); }
static NSURL *URL(const char *path) {
    return [NSURL fileURLWithPath:@(path)].URLByStandardizingPath;
}
void anubis_apple_free(char *value) { free(value); }

static dispatch_source_t Timeout(NSFileCoordinator *coordinator) {
    dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
        dispatch_get_global_queue(QOS_CLASS_UTILITY, 0));
    dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC),
                              DISPATCH_TIME_FOREVER, NSEC_PER_SEC);
    dispatch_source_set_event_handler(timer, ^{ [coordinator cancel]; });
    dispatch_resume(timer);
    return timer;
}

char *anubis_apple_coordinate(const char *path, const char *destination, int mode,
                              void *context, Access access) {
    @autoreleasepool {
        NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
        NSURL *source = URL(path);
        NSError *error = nil;
        // An offline/cloud provider must not hold the editor indefinitely.
        dispatch_source_t timeout = Timeout(coordinator);
        if (mode <= 1) {
            NSFileCoordinatorReadingOptions options = mode == 0
                ? NSFileCoordinatorReadingImmediatelyAvailableMetadataOnly : NSFileCoordinatorReadingWithoutChanges;
            [coordinator coordinateReadingItemAtURL:source options:options error:&error byAccessor:^(NSURL *url) {
                access(context, url.path.fileSystemRepresentation, NULL);
            }];
        } else if (mode == 4) {
            [coordinator coordinateWritingItemAtURL:source options:NSFileCoordinatorWritingForMoving
                writingItemAtURL:URL(destination) options:NSFileCoordinatorWritingForReplacing
                error:&error byAccessor:^(NSURL *from, NSURL *to) {
                    if (access(context, from.path.fileSystemRepresentation, to.path.fileSystemRepresentation)) {
                        [coordinator itemAtURL:from didMoveToURL:to];
                    }
                }];
        } else {
            NSFileCoordinatorWritingOptions options = mode == 3 ? NSFileCoordinatorWritingForDeleting
                : mode == 2 ? NSFileCoordinatorWritingForReplacing : 0;
            [coordinator coordinateWritingItemAtURL:source options:options error:&error byAccessor:^(NSURL *url) {
                access(context, url.path.fileSystemRepresentation, NULL);
            }];
        }
        dispatch_source_cancel(timeout);
        return error ? Message([NSString stringWithFormat:@"File access failed: %@. Download the file in Files or Finder and try again.", error.localizedDescription]) : NULL;
    }
}

// Resource metadata must not download file contents merely to display status.
static NSDictionary *Cloud(NSURL *url) {
    [url removeAllCachedResourceValues];
    NSDictionary *values = [url promisedItemResourceValuesForKeys:@[
        NSURLIsUbiquitousItemKey, NSURLUbiquitousItemDownloadingStatusKey,
        NSURLUbiquitousItemIsDownloadingKey, NSURLUbiquitousItemIsUploadedKey,
        NSURLUbiquitousItemUploadingErrorKey, NSURLUbiquitousItemDownloadingErrorKey
    ] error:nil];
    if (![values[NSURLIsUbiquitousItemKey] boolValue]) return nil;
    NSString *status = values[NSURLUbiquitousItemDownloadingStatusKey];
    NSError *error = values[NSURLUbiquitousItemDownloadingErrorKey] ?: values[NSURLUbiquitousItemUploadingErrorKey];
    return @{
        @"downloaded": @((BOOL)([status isEqual:NSURLUbiquitousItemDownloadingStatusCurrent] ||
                            [status isEqual:NSURLUbiquitousItemDownloadingStatusDownloaded])),
        @"uploaded": @([values[NSURLUbiquitousItemIsUploadedKey] boolValue]),
        @"downloading": @([values[NSURLUbiquitousItemIsDownloadingKey] boolValue]),
        @"conflicts": @([NSFileVersion unresolvedConflictVersionsOfItemAtURL:url].count),
        @"error": error.localizedDescription ?: @""
    };
}

char *anubis_apple_cloud(const char *path) {
    @autoreleasepool {
        NSDictionary *cloud = Cloud(URL(path));
        NSData *json = [NSJSONSerialization dataWithJSONObject:cloud ?: (id)[NSNull null]
            options:NSJSONWritingFragmentsAllowed error:nil];
        return Message([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]);
    }
}

int anubis_apple_placeholder(const char *path) {
    @autoreleasepool {
        return [[NSFileManager defaultManager] isUbiquitousItemAtURL:URL(path)];
    }
}

char *anubis_apple_trash(const char *path) {
    @autoreleasepool {
        NSError *error = nil;
        if (![[NSFileManager defaultManager] trashItemAtURL:URL(path) resultingItemURL:nil error:&error]) {
            return Message([NSString stringWithFormat:@"Could not move the document to Trash: %@", error.localizedDescription]);
        }
        return NULL;
    }
}

// The caller holds a coordinated write on the original document. Copy each
// competing version before resolving it; partial failures leave remaining
// versions intact. UUID names and copyItem prevent overwriting existing files.
char *anubis_apple_keep_versions(const char *path) {
    @autoreleasepool {
        NSURL *original = URL(path);
        for (NSFileVersion *version in [NSFileVersion unresolvedConflictVersionsOfItemAtURL:original]) {
            NSFileCoordinator *reader = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
            dispatch_source_t timeout = Timeout(reader);
            __block NSError *copyError = nil;
            NSError *coordinationError = nil;
            [reader coordinateReadingItemAtURL:version.URL options:NSFileCoordinatorReadingWithoutChanges
                error:&coordinationError byAccessor:^(NSURL *versionURL) {
                    NSString *stem = original.lastPathComponent.stringByDeletingPathExtension;
                    NSString *name = [NSString stringWithFormat:@"%@ (conflict %@).%@", stem,
                        NSUUID.UUID.UUIDString, original.pathExtension];
                    NSURL *copy = [original.URLByDeletingLastPathComponent URLByAppendingPathComponent:name];
                    NSFileCoordinator *writer = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
                    dispatch_source_t writeTimeout = Timeout(writer);
                    NSError *writeError = nil;
                    [writer coordinateWritingItemAtURL:copy options:0 error:&writeError byAccessor:^(NSURL *target) {
                        if (![target.path isEqual:copy.path]) {
                            copyError = [NSError errorWithDomain:NSCocoaErrorDomain code:NSFileWriteUnknownError userInfo:@{NSLocalizedDescriptionKey: @"The conflict destination moved. Refresh the folder and try again."}];
                            return;
                        }
                        if ([[NSFileManager defaultManager] copyItemAtURL:versionURL toURL:target error:&copyError]) {
                            int fd = open(target.path.fileSystemRepresentation, O_RDONLY | O_NOFOLLOW);
                            if (fd < 0 || fsync(fd) != 0) {
                                copyError = [NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil];
                            }
                            if (fd >= 0) close(fd);
                        }
                    }];
                    dispatch_source_cancel(writeTimeout);
                    if (writeError) copyError = writeError;
                }];
            dispatch_source_cancel(timeout);
            NSError *error = coordinationError ?: copyError;
            if (error) return Message([NSString stringWithFormat:@"Could not preserve an iCloud version: %@. Uncopied versions are retained.", error.localizedDescription]);
            version.resolved = YES;
            if (![version removeAndReturnError:&error]) {
                return Message([NSString stringWithFormat:@"The conflict copy was saved, but iCloud could not clean up its version: %@", error.localizedDescription]);
            }
        }
        return NULL;
    }
}

@interface AnubisFolderPresenter : NSObject <NSFilePresenter>
@property(nonatomic, copy) NSURL *presentedItemURL;
@property(nonatomic, strong) NSOperationQueue *presentedItemOperationQueue;
@property(nonatomic) Changed changed;
@property(nonatomic) void *context;
@end
@implementation AnubisFolderPresenter
- (void)presentedItemDidChange { self.changed(self.context); }
- (void)presentedSubitemDidAppearAtURL:(NSURL *)url { self.changed(self.context); }
- (void)presentedSubitemDidChangeAtURL:(NSURL *)url { self.changed(self.context); }
- (void)presentedItemDidMoveToURL:(NSURL *)url { self.changed(self.context); }
- (void)presentedSubitemAtURL:(NSURL *)oldURL didMoveToURL:(NSURL *)newURL { self.changed(self.context); }
- (void)presentedItemDidGainVersion:(NSFileVersion *)version { self.changed(self.context); }
- (void)presentedSubitemAtURL:(NSURL *)url didGainVersion:(NSFileVersion *)version { self.changed(self.context); }
- (void)accommodatePresentedItemDeletionWithCompletionHandler:(void (^)(NSError *))completion {
    self.changed(self.context); completion(nil);
}
- (void)accommodatePresentedSubitemDeletionAtURL:(NSURL *)url completionHandler:(void (^)(NSError *))completion {
    self.changed(self.context); completion(nil);
}
@end

void *anubis_apple_watch(const char *path, void *context, Changed changed) {
    @autoreleasepool {
        AnubisFolderPresenter *presenter = [AnubisFolderPresenter new];
        presenter.presentedItemURL = URL(path);
        presenter.presentedItemOperationQueue = [NSOperationQueue new];
        presenter.presentedItemOperationQueue.maxConcurrentOperationCount = 1;
        presenter.context = context;
        presenter.changed = changed;
        [NSFileCoordinator addFilePresenter:presenter];
        return (__bridge_retained void *)presenter;
    }
}
void anubis_apple_unwatch(void *handle) {
    @autoreleasepool {
        AnubisFolderPresenter *presenter = CFBridgingRelease(handle);
        [NSFileCoordinator removeFilePresenter:presenter];
        [presenter.presentedItemOperationQueue waitUntilAllOperationsAreFinished];
    }
}
