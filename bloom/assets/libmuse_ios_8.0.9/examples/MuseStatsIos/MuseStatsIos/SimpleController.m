//
//  SimpleController.m
//  MuseStatsIos
//
//  Created by Yue Huang on 2015-09-01.
//  Copyright (c) 2015 InteraXon. All rights reserved.
//

#import "SimpleController.h"
#import <CoreBluetooth/CoreBluetooth.h>

@interface SimpleController () <CBCentralManagerDelegate>
@property IXNMuseManagerIos * manager;
@property (weak, nonatomic) IXNMuse * muse;
@property (nonatomic) NSMutableArray* logLines;
@property (nonatomic) BOOL lastBlink;
@property (nonatomic, strong) CBCentralManager * btManager;
@property (atomic) BOOL btState;
@property (nonatomic, strong) NSTimer *timer;
@property (nonatomic) NSString *name;
@property (nonatomic) NSMutableArray* eegValues;
@property (nonatomic) NSMutableArray* hsiValues;
@property (nonatomic) NSDictionary* hsiMap;

@end

@implementation SimpleController


- (void)viewDidLoad {
    [super viewDidLoad];
    [UIApplication sharedApplication].idleTimerDisabled = YES;
    self.logView.editable = NO;
    if (!self.manager) {
        self.manager = [IXNMuseManagerIos sharedManager];
    }
}

- (void)applicationWillTerminate:(UIApplication *)application {
    if (self.timer) {
        [self.timer invalidate];
        self.timer = nil;
    }
}

- (instancetype) initWithNibName:(NSString *)nibNameOrNil
                          bundle:(NSBundle *)nibBundleOrNil {
    if (self = [super initWithNibName:nibNameOrNil bundle:nibBundleOrNil]) {
        self.manager = [IXNMuseManagerIos sharedManager];
        [self.manager setMuseListener:self];
        self.tableView = [[UITableView alloc] init];

        self.logView = [[UITextView alloc] init];
        self.logLines = [NSMutableArray array];
        [self.logView setText:@""];
        
        [[IXNLogManager instance] setLogListener:self];
        NSDateFormatter *dateFormatter=[[NSDateFormatter alloc] init];
        [dateFormatter setDateFormat:@"yyyy-MM-dd hh:mm:ss"];
        NSString * dateStr = [[dateFormatter stringFromDate:[NSDate date]] stringByAppendingString:@".log"];
        NSLog(@"%@", dateStr);
        
        self.btManager = [[CBCentralManager alloc] initWithDelegate:self queue:nil options:nil];
        self.btState = FALSE;
        
        self.name = @"";
        self.eegValues = [NSMutableArray arrayWithObjects:@0.0, @0.0, @0.0, @0.0, nil];
        self.hsiValues = [NSMutableArray arrayWithObjects:@0, @0, @0, @0, nil];
        self.hsiMap = @{@0: @"None", @1: @"Good", @2: @"Fair", @3: @"Poor", @4: @"Bad"};
        self.timer = [NSTimer scheduledTimerWithTimeInterval:0.05
                                                     target:self
                                                   selector:@selector(updateUI)
                                                   userInfo:nil
                                                    repeats:YES];
    }
    return self;
}

- (void)log:(NSString *)fmt, ... {
    va_list args;
    va_start(args, fmt);
    NSString *line = [[NSString alloc] initWithFormat:fmt arguments:args];
    va_end(args);
    NSLog(@"%@", line);
    [self.logLines insertObject:line atIndex:0];
    
    dispatch_async(dispatch_get_main_queue(), ^ {
        [self.logView setText:[self.logLines componentsJoinedByString:@"\n"]];
    });
}

- (void)receiveLog:(nonnull IXNLogPacket *)l {
  [self log:@"%@: %f raw:%d %@", l.tag, l.timestamp, l.raw, l.message];
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
    self.btState = (self.btManager.state == CBManagerStatePoweredOn);
}

- (bool)isBluetoothEnabled {
    return self.btState;
}

- (void)museListChanged {
    [self.tableView reloadData];
}

- (NSInteger)tableView:(UITableView *)tableView
 numberOfRowsInSection:(NSInteger)section {
    return [[self.manager getMuses] count];
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    static NSString *simpleTableIdentifier = @"nil";
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:
                             simpleTableIdentifier];
    if (cell == nil) {
        cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault
                                      reuseIdentifier:simpleTableIdentifier];
    }
    NSArray * muses = [self.manager getMuses];
    if (indexPath.row < [muses count]) {
        IXNMuse * muse = [[self.manager getMuses] objectAtIndex:indexPath.row];
        cell.textLabel.text = [muse getName];
    }
    return cell;
}

- (void)tableView:(UITableView *)tableView
didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    NSArray * muses = [self.manager getMuses];
    if (indexPath.row < [muses count]) {
        IXNMuse * muse = [muses objectAtIndex:indexPath.row];
        @synchronized (self.muse) {
            if(self.muse == nil) {
                self.muse = muse;
            }else if(self.muse != muse) {
                [self.muse disconnect];
                self.muse = muse;
            }
        }
        [self connect];
        [self log:@"======Choose to connect muse %@ %@======\n",
              [self.muse getName], [self.muse getMacAddress]];
    }
}

- (void)receiveMuseConnectionPacket:(IXNMuseConnectionPacket *)packet
                               muse:(IXNMuse *)muse {
    NSString *state;
    switch (packet.currentConnectionState) {
        case IXNConnectionStateDisconnected:
            state = @"disconnected";
            break;
        case IXNConnectionStateConnected:
            state = @"connected";
            break;
        case IXNConnectionStateConnecting:
            state = @"connecting";
            break;
        case IXNConnectionStateNeedsUpdate: state = @"needs update"; break;
        case IXNConnectionStateNeedsLicense: state = @"needs license"; break;
        case IXNConnectionStateUnknown: state = @"unknown"; break;
        default: NSAssert(NO, @"impossible connection state received");
    }
    [self log:@"connect: %@", state];
}

- (void) connect {
    [self.muse registerConnectionListener:self];
    [self.muse registerDataListener:self type:IXNMuseDataPacketTypeArtifacts];
    [self.muse registerDataListener:self type:IXNMuseDataPacketTypeHsiPrecision];
    
    bool showAlpha = true;
    
    if (showAlpha) {
        [self.muse registerDataListener:self type:IXNMuseDataPacketTypeAlphaAbsolute];
    } else {
        [self.muse registerDataListener:self type:IXNMuseDataPacketTypeEeg];
    }
    [self.muse setPreset:IXNMusePresetPreset21]; // See documentation on presets
    [self.muse runAsynchronously];
    //[self runAsynchronouslyWithMuse:self.muse];
}

- (void)runAsynchronouslyWithMuse:(IXNMuse *)muse {
    NSTimeInterval TickIntervalSecs = 0.02;
    [muse connect];
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        while (true) {
            [muse execute];
            if ([muse getConnectionState] == IXNConnectionStateDisconnected) {
                [self log:@"Detected disconnected state... stopping async execution"];
                break;
            }
            [NSThread sleepForTimeInterval:TickIntervalSecs];
        }
    });
}

- (void)receiveMuseDataPacket:(IXNMuseDataPacket *)packet
                         muse:(IXNMuse *)muse {
    if (packet.packetType == IXNMuseDataPacketTypeAlphaAbsolute ||
            packet.packetType == IXNMuseDataPacketTypeEeg) {
        if (packet.packetType == IXNMuseDataPacketTypeAlphaAbsolute) {
            self.name = @"Alpha:";
        } else {
            self.name = @"EEG:";
        }
        self.eegValues[0] = @([packet getEegChannelValue:IXNEegEEG1]);
        self.eegValues[1] = @([packet getEegChannelValue:IXNEegEEG2]);
        self.eegValues[2] = @([packet getEegChannelValue:IXNEegEEG3]);
        self.eegValues[3] = @([packet getEegChannelValue:IXNEegEEG4]);
    }
    else if (packet.packetType == IXNMuseDataPacketTypeHsiPrecision) {
        self.hsiValues[0] = @([packet getEegChannelValue:IXNEegEEG1]);
        self.hsiValues[1] = @([packet getEegChannelValue:IXNEegEEG2]);
        self.hsiValues[2] = @([packet getEegChannelValue:IXNEegEEG3]);
        self.hsiValues[3] = @([packet getEegChannelValue:IXNEegEEG4]);
    }
}

- (void)receiveMuseArtifactPacket:(IXNMuseArtifactPacket *)packet
                             muse:(IXNMuse *)muse {
    if (packet.blink && packet.blink != self.lastBlink) {
        [self log:@"blink detected"];
    }
    self.lastBlink = packet.blink;
}

- (void)updateUI {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.labelName.text = self.name;
        self.labelEeg1.text = [NSString stringWithFormat:@"%.2f", [self.eegValues[0] doubleValue]];
        self.labelEeg2.text = [NSString stringWithFormat:@"%.2f", [self.eegValues[1] doubleValue]];
        self.labelEeg3.text = [NSString stringWithFormat:@"%.2f", [self.eegValues[2] doubleValue]];
        self.labelEeg4.text = [NSString stringWithFormat:@"%.2f", [self.eegValues[3] doubleValue]];
        
        self.labelHsi.text = @"Signal:";
        self.labelQ1.text = self.hsiMap[self.hsiValues[0]];
        self.labelQ2.text = self.hsiMap[self.hsiValues[1]];
        self.labelQ3.text = self.hsiMap[self.hsiValues[2]];
        self.labelQ4.text = self.hsiMap[self.hsiValues[3]];
    });
}

- (void)applicationWillResignActive {
    NSLog(@"disconnecting before going into background");
    [self.muse disconnect];
}

- (IBAction)disconnect:(id)sender {
    if (self.muse) [self.muse disconnect];
}

- (IBAction)scan:(id)sender {
    [self.manager startListening];
    [self.tableView reloadData];
}

- (IBAction)stopScan:(id)sender {
    [self.manager stopListening];
    [self.tableView reloadData];
}
@end
