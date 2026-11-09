//
//  SimpleController.h
//  MuseStatsIos
//
//  Created by Yue Huang on 2015-09-01.
//  Copyright (c) 2015 InteraXon. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <Muse.h>

@interface SimpleController : UIViewController
< IXNMuseConnectionListener, IXNMuseDataListener, IXNMuseListener, IXNLogListener,
  UITableViewDelegate, UITableViewDataSource>

@property (nonatomic, strong) IBOutlet UITableView* tableView;
@property (nonatomic, strong) IBOutlet UITextView* logView;
@property (nonatomic, strong) IBOutlet UILabel* labelName;
@property (nonatomic, strong) IBOutlet UILabel* labelEeg1;
@property (nonatomic, strong) IBOutlet UILabel* labelEeg2;
@property (nonatomic, strong) IBOutlet UILabel* labelEeg3;
@property (nonatomic, strong) IBOutlet UILabel* labelEeg4;
@property (nonatomic, strong) IBOutlet UILabel* labelHsi;
@property (nonatomic, strong) IBOutlet UILabel* labelQ1;
@property (nonatomic, strong) IBOutlet UILabel* labelQ2;
@property (nonatomic, strong) IBOutlet UILabel* labelQ3;
@property (nonatomic, strong) IBOutlet UILabel* labelQ4;
- (IBAction)disconnect:(id)sender;
- (IBAction)scan:(id)sender;
- (IBAction)stopScan:(id)sender;
- (void)applicationWillResignActive;
@end
