#import <Foundation/Foundation.h>
#import <CloudKit/CloudKit.h>

static NSError *Failure(NSString *text) { return [NSError errorWithDomain:@"AnubisNotes" code:1 userInfo:@{NSLocalizedDescriptionKey:text}]; }
static NSString *Encode(id<NSSecureCoding> value) {
    NSData *data=[NSKeyedArchiver archivedDataWithRootObject:value requiringSecureCoding:YES error:nil];
    return [data base64EncodedStringWithOptions:0];
}
static NSString *Fields(CKRecord *record) {
    NSKeyedArchiver *coder=[[NSKeyedArchiver alloc] initRequiringSecureCoding:YES];
    [record encodeSystemFieldsWithCoder:coder]; [coder finishEncoding];
    return [coder.encodedData base64EncodedStringWithOptions:0];
}
static BOOL Wait(dispatch_semaphore_t sem, CKOperation *operation, NSError **error) {
    if(dispatch_semaphore_wait(sem,dispatch_time(DISPATCH_TIME_NOW,45*NSEC_PER_SEC))) {
        [operation cancel]; *error=Failure(@"iCloud did not respond. Your notes remain saved locally. Try syncing again later."); return NO;
    }
    return YES;
}
static NSDictionary *Record(CKRecord *record, NSError **error) {
    CKAsset *body=(CKAsset *)record[@"body"];
    if(![body isKindOfClass:CKAsset.class] || !body.fileURL) {*error=Failure(@"A cloud note has no readable content.");return nil;}
    NSDictionary *attrs=[[NSFileManager defaultManager] attributesOfItemAtPath:body.fileURL.path error:error];
    if(!attrs || [attrs fileSize]>11*1024*1024){*error=Failure(@"A cloud note exceeds the note size limit.");return nil;}
    NSData *data=[NSData dataWithContentsOfURL:body.fileURL options:0 error:error];
    if(!data)return nil;
    id note=[NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    if(!note)return nil;
    if(![note isKindOfClass:NSDictionary.class] || ![note[@"id"] isEqual:record.recordID.recordName]) {*error=Failure(@"Cloud note identity mismatch.");return nil;}
    NSArray *ids=(NSArray *)record[@"imageIds"] ?: @[];
    NSArray *images=(NSArray *)record[@"images"] ?: @[];
    if(ids.count!=images.count){*error=Failure(@"Cloud attachment metadata is incomplete.");return nil;}
    NSMutableDictionary *assets=[NSMutableDictionary dictionary];
    for(NSUInteger i=0;i<ids.count;i++) {
        CKAsset *asset=images[i];
        NSDictionary *attributes=[[NSFileManager defaultManager] attributesOfItemAtPath:asset.fileURL.path error:error];
        if(!attributes || [attributes fileSize]>20*1024*1024){*error=Failure(@"A cloud image exceeds the image size limit.");return nil;}
        NSData *bytes=[NSData dataWithContentsOfURL:asset.fileURL options:0 error:error];
        if(!bytes)return nil;
        assets[ids[i]]=[bytes base64EncodedStringWithOptions:0];
    }
    return @{ @"note":note, @"fields":Fields(record), @"assets":assets };
}
// Called on a Rust worker. Each invocation owns its operations and waits; no UI
// thread or user document workspace is used for CloudKit network operations.
char *anubis_note_cloud(const char *input) {
    @autoreleasepool { @try {
        NSError *error=nil;
        NSDictionary *request=[NSJSONSerialization JSONObjectWithData:[@(input) dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];
        NSString *identifier=[[NSBundle mainBundle] objectForInfoDictionaryKey:@"AnubisCloudKitContainer"];
        if(![identifier isEqualToString:@"iCloud.com.stubbornspace.kronos"])
            return strdup("{\"error\":\"iCloud sync needs an Anubis build signed with the iCloud.com.stubbornspace.kronos container. Your library is saved on this device.\"}");
        CKContainer *container=[CKContainer containerWithIdentifier:identifier];
        CKDatabase *database=container.privateCloudDatabase;
        NSString *op=request[@"op"];
        NSMutableDictionary *result=[NSMutableDictionary dictionary];
        if([op isEqualToString:@"account"]) {
            dispatch_semaphore_t sem=dispatch_semaphore_create(0);
            __block CKRecordID *account=nil; __block NSError *failure=nil;
            [container fetchUserRecordIDWithCompletionHandler:^(CKRecordID *recordID,NSError *e){account=recordID;failure=e;dispatch_semaphore_signal(sem);}];
            if(Wait(sem,nil,&error)) {error=failure;if(account)result[@"account"]=account.recordName;}
        } else {
            dispatch_semaphore_t accountSem=dispatch_semaphore_create(0);
            __block NSString *currentAccount=nil; __block NSError *accountError=nil;
            [container fetchUserRecordIDWithCompletionHandler:^(CKRecordID *recordID,NSError *e){currentAccount=recordID.recordName;accountError=e;dispatch_semaphore_signal(accountSem);}];
            if(!Wait(accountSem,nil,&error) || accountError || ![currentAccount isEqual:request[@"account"]]) {
                NSData *json=[NSJSONSerialization dataWithJSONObject:@{@"error": (error ?: accountError).localizedDescription ?: @"The iCloud account changed. Sync is paused."} options:0 error:nil];
                return strdup([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
            }
            CKRecordZoneID *zoneID=[[CKRecordZoneID alloc] initWithZoneName:@"AnubisNotes" ownerName:CKCurrentUserDefaultName];
            if([op isEqualToString:@"fetch"]) {
                if([request[@"createZone"] boolValue]) {
                dispatch_semaphore_t zoneSem=dispatch_semaphore_create(0);
                __block NSError *zoneError=nil;
                [database saveRecordZone:[[CKRecordZone alloc] initWithZoneID:zoneID] completionHandler:^(CKRecordZone *zone,NSError *e){(void)zone;zoneError=e;dispatch_semaphore_signal(zoneSem);}];
                if(Wait(zoneSem,nil,&error))error=zoneError;
                }
                if(!error) {
                    CKFetchRecordZoneChangesConfiguration *config=[CKFetchRecordZoneChangesConfiguration new];
                    if([request[@"token"] length]) config.previousServerChangeToken=[NSKeyedUnarchiver unarchivedObjectOfClass:CKServerChangeToken.class fromData:[[NSData alloc] initWithBase64EncodedString:request[@"token"] options:0] error:&error];
                    if(!error) {
                        config.resultsLimit=100;
                        CKFetchRecordZoneChangesOperation *fetch=[[CKFetchRecordZoneChangesOperation alloc] initWithRecordZoneIDs:@[zoneID] configurationsByRecordZoneID:@{zoneID:config}];
                        fetch.fetchAllChanges=NO;
                        NSMutableArray *records=[NSMutableArray array];
                        NSMutableArray *deleted=[NSMutableArray array];
                        __block NSError *failure=nil; __block NSString *token=nil; __block BOOL more=NO;
                        dispatch_semaphore_t sem=dispatch_semaphore_create(0);
                        fetch.recordWasChangedBlock=^(CKRecordID *recordID,CKRecord *record,NSError *e){
                            (void)recordID;
                            if(e){failure=e;return;}
                            NSError *parseError=nil; NSDictionary *value=Record(record,&parseError);
                            if(value)[records addObject:value];else failure=parseError;
                        };
                        fetch.recordWithIDWasDeletedBlock=^(CKRecordID *recordID,CKRecordType type){(void)type;[deleted addObject:recordID.recordName];};
                        fetch.recordZoneFetchCompletionBlock=^(CKRecordZoneID *zone,CKServerChangeToken *next,NSData *client,BOOL moreComing,NSError *e){
                            (void)zone;(void)client;
                            if(e)failure=e; if(next)token=Encode(next); more=moreComing;
                        };
                        fetch.fetchRecordZoneChangesCompletionBlock=^(NSError *e){if(e && !failure)failure=e;dispatch_semaphore_signal(sem);};
                        fetch.configuration.timeoutIntervalForRequest=30;
                        [database addOperation:fetch];
                        if(Wait(sem,fetch,&error)) {
                            error=failure;
                            if(failure.code==CKErrorChangeTokenExpired)result[@"resetToken"]=@YES;
                            if(!error){result[@"records"]=records;result[@"deleted"]=deleted;result[@"token"]=token ?: request[@"token"] ?: @"";result[@"more"]=@(more);}
                        }
                    }
                }
            } else if([op isEqualToString:@"push"]) {
                CKRecord *record=nil;
                if([request[@"fields"] length]) {
                    NSKeyedUnarchiver *coder=[[NSKeyedUnarchiver alloc] initForReadingFromData:[[NSData alloc] initWithBase64EncodedString:request[@"fields"] options:0] error:&error];
                    coder.requiresSecureCoding=YES;record=[[CKRecord alloc] initWithCoder:coder];[coder finishDecoding];
                } else record=[[CKRecord alloc] initWithRecordType:@"AnubisNote" recordID:[[CKRecordID alloc] initWithRecordName:request[@"id"] zoneID:zoneID]];
                if(!error) {
                    record[@"body"]=[[CKAsset alloc] initWithFileURL:[NSURL fileURLWithPath:request[@"bodyPath"]]];
                    NSDictionary *paths=request[@"assets"];
                    NSArray *ids=[[paths allKeys] sortedArrayUsingSelector:@selector(compare:)];
                    NSMutableArray *images=[NSMutableArray array];
                    for(NSString *key in ids)[images addObject:[[CKAsset alloc] initWithFileURL:[NSURL fileURLWithPath:paths[key]]]];
                    record[@"imageIds"]=ids;record[@"images"]=images;
                    CKModifyRecordsOperation *save=[[CKModifyRecordsOperation alloc] initWithRecordsToSave:@[record] recordIDsToDelete:nil];
                    save.savePolicy=CKRecordSaveIfServerRecordUnchanged;save.atomic=YES;
                    __block NSError *failure=nil;__block NSString *fields=nil;
                    dispatch_semaphore_t sem=dispatch_semaphore_create(0);
                    save.perRecordSaveBlock=^(CKRecordID *recordID,CKRecord *saved,NSError *e){(void)recordID;if(e)failure=e;if(saved)fields=Fields(saved);};
                    save.modifyRecordsCompletionBlock=^(NSArray<CKRecord *> *savedRecords,NSArray<CKRecordID *> *deletedIDs,NSError *e){(void)savedRecords;(void)deletedIDs;if(e)failure=e;dispatch_semaphore_signal(sem);};
                    save.configuration.timeoutIntervalForRequest=30;[database addOperation:save];
                    if(Wait(sem,save,&error)){error=failure;if(!error && fields)result[@"fields"]=fields;}
                }
            } else error=Failure(@"Unknown sync operation.");
        }
        if(error)result[@"error"]=error.localizedDescription;
        NSData *json=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        return strdup([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
    } @catch(NSException *exception) {
        NSData *json=[NSJSONSerialization dataWithJSONObject:@{@"error": exception.reason ?: @"CloudKit is unavailable in this build."} options:0 error:nil];
        return strdup([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
    }}
}
