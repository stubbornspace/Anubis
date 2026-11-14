#import <Foundation/Foundation.h>

extern char *anubis_apple_coordinate(const char *, const char *, int, void *, int (*)(void *, const char *, const char *));
extern char *anubis_apple_cloud(const char *);
extern void anubis_apple_free(char *);

static NSDictionary *Status(NSURL *url) {
    char *raw = anubis_apple_cloud(url.path.fileSystemRepresentation);
    NSData *data = [@(raw) dataUsingEncoding:NSUTF8StringEncoding];
    anubis_apple_free(raw);
    id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [value isKindOfClass:NSDictionary.class] ? value : nil;
}
static int Write(void *context, const char *path, const char *unused) {
    return [@"# Cloud download validation\n" writeToFile:@(path) atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
static int Read(void *context, const char *path, const char *unused) {
    BOOL correct = [[NSString stringWithContentsOfFile:@(path) encoding:NSUTF8StringEncoding error:nil]
        isEqual:@"# Cloud download validation\n"];
    *(BOOL *)context = correct;
    return correct;
}
static BOOL Wait(NSURL *file, NSString *key, BOOL expected) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:40];
    while ([deadline timeIntervalSinceNow] > 0) {
        NSDictionary *status = Status(file);
        if (status && [status[key] boolValue] == expected) return YES;
        [NSThread sleepForTimeInterval:0.25];
    }
    return NO;
}

// Explicit opt-in only. The argument is an existing iCloud Drive directory.
// Only the uniquely named test directory created here is touched.
int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc != 2) { fputs("Pass an iCloud Drive test root.\n", stderr); return 2; }
        NSURL *root = [NSURL fileURLWithPath:@(argv[1])];
        if (![[NSFileManager defaultManager] isUbiquitousItemAtURL:root]) return 2;
        NSURL *folder = [root URLByAppendingPathComponent:[@"Anubis-Download-Test-" stringByAppendingString:NSUUID.UUID.UUIDString]];
        NSError *error = nil;
        if (![[NSFileManager defaultManager] createDirectoryAtURL:folder withIntermediateDirectories:NO attributes:nil error:&error]) return 2;
        NSURL *file = [folder URLByAppendingPathComponent:@"download.md"];
        char *failure = anubis_apple_coordinate(file.path.fileSystemRepresentation, NULL, 5, NULL, Write);
        BOOL passed = failure == NULL;
        if (failure) { fputs(failure, stderr); anubis_apple_free(failure); }
        if (passed) passed = Wait(file, @"uploaded", YES);
        if (passed) passed = [[NSFileManager defaultManager] evictUbiquitousItemAtURL:file error:&error];
        if (passed) passed = Wait(file, @"downloaded", NO);
        if (passed) {
            BOOL correct = NO;
            failure = anubis_apple_coordinate(file.path.fileSystemRepresentation, NULL, 1, &correct, Read);
            passed = failure == NULL && correct && [Status(file)[@"downloaded"] boolValue];
            if (failure) { fputs(failure, stderr); anubis_apple_free(failure); }
        }
        // Preserve user data: this URL can only be the test directory above.
        BOOL cleaned = [[NSFileManager defaultManager] trashItemAtURL:folder resultingItemURL:nil error:&error];
        if (error) fprintf(stderr, "%s\n", error.localizedDescription.UTF8String);
        puts(passed && cleaned ? "Cloud upload, eviction, coordinated download, and Trash passed." : "Cloud download test failed.");
        return passed && cleaned ? 0 : 1;
    }
}
