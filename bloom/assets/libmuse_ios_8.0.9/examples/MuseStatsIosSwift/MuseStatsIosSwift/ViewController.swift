//
//  ViewController.swift
//  MuseStatsIosSwift
//
//  Created by Gair Shields on 2024-02-23.
//

import UIKit

class ViewController: UIViewController, IXNLogListener, UIPickerViewDataSource, UIPickerViewDelegate, UITableViewDataSource, UITableViewDelegate, UITextFieldDelegate {
    var museManager: IXNMuseManager?
    var museListener: IXNMuseListener?
    var dataListener: IXNMuseDataListener?
    var connectionListener: IXNMuseConnectionListener?
    var logManager: IXNLogManager?
    var museList: [String] = []
    var museMap = [String: IXNMuse]()

    // Log messages are buffered off the main thread and flushed periodically so
    // that bursts of log output don't block the main thread. The log is
    // rendered with a virtualized UITableView so scrolling cost is O(visible
    // rows) regardless of history size.
    private let logBufferLock = NSLock()
    private var pendingLogMessages: [String] = []
    private var logLines: [String] = []
    private var logFlushTimer: Timer?
    private var shouldAutoScroll = true
    private let logFlushInterval: TimeInterval = 0.1
    private let maxLogLines = 5_000
    private let logCellReuseID = "LogCell"

    // Cached on the main thread so the EEG receive callback (which may be
    // called from a background SDK thread) can read it without touching UIKit.
    private var oscEnabledCached = false

    // Last values persisted / pushed to the sender. Used to skip redundant
    // work on every editingDidEnd / valueChanged callback.
    private var lastAppliedHost: String = ""
    private var lastAppliedPort: UInt16 = 0
    private var lastAppliedEnabled: Bool = false

    // viewDidAppear fires every time the VC becomes visible; only warm up once.
    private var hasWarmedUpSubsystems = false

    // Selects which execute() loop drives the Muse object. Flip this to
    // compare performance / responsiveness of the two models.
    //
    //   true  – our custom serial-queue loop. `execute()` runs on `museQueue`
    //           at ~50 Hz, all Muse callbacks arrive on that same queue, and
    //           UIKit / museManager work is explicitly hopped back to main.
    //           Keeps main thread free for the UI.
    //
    //   false – `muse.runAsynchronously()`. The SDK owns execution and, per
    //           IXNMuse.h, delivers every packet listener callback on the
    //           main thread at 256 Hz. Heavier main-thread load but simpler
    //           threading.
    private let useCustomExecuteLoop = true

    // When `useCustomExecuteLoop` is true, all calls into an IXNMuse object
    // (execute(), connect(), disconnect(), register(), setPreset(),
    // getConnectionState()) are serialized on this queue. IXNMuse.h
    // documents `execute()` as not thread safe, and by extension the rest of
    // the object has no internal locking either.
    //
    // When `useCustomExecuteLoop` is false the SDK owns its own execute
    // thread, this queue is unused, and Muse calls run on the main thread
    // (matching the SDK's listener-callback threading).
    private let museQueue = DispatchQueue(label: "com.museStatsIosSwift.muse")
    private let tickIntervalSecs: TimeInterval = 0.02

    private enum OSCDefaults {
        static let host = "oscHost"
        static let port = "oscPort"
        static let enabled = "oscEnabled"

        static let defaultHost = "192.168.4.1"
        static let defaultPort: UInt16 = 7000
        static let eegAddress = "/eeg"
    }

    private var oscSender: OSCSender?

    @IBOutlet weak var graphView: GraphView!
    @IBOutlet weak var logTableView: UITableView!
    @IBOutlet weak var buttonDisconnect: UIButton!
    @IBOutlet weak var buttonConnect: UIButton!
    @IBOutlet weak var buttonScan: UIButton!
    @IBOutlet weak var musePicker: UIPickerView!
    @IBOutlet weak var oscHostField: UITextField!
    @IBOutlet weak var oscPortField: UITextField!
    @IBOutlet weak var oscEnabledSwitch: UISwitch!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        self.musePicker.dataSource = self
        self.musePicker.delegate = self
        self.logManager = IXNLogManager.instance()
        self.logManager?.setLogListener(self)
        // The SDK is extremely chatty at verbose/debug level. Dropping
        // below-info messages at the source keeps the main thread from being
        // hammered with log callbacks during streaming.
        self.logManager?.setMinimumSeverity(.sevInfo)
        self.museManager = IXNMuseManagerIos()
        self.museListener = MuseListener(parent: self)
        self.dataListener = DataListener(parent: self)
        self.connectionListener = ConnectionListener(parent: self)
        
        self.museManager?.removeFromList(after: 10)
        self.museManager?.setMuseListener(self.museListener)
        self.museManager?.startListening()
        self.logTableView.dataSource = self
        self.logTableView.delegate = self
        self.logTableView.rowHeight = UITableView.automaticDimension
        self.logTableView.estimatedRowHeight = 20
        self.logTableView.separatorStyle = .none
        self.logTableView.allowsSelection = false
        self.logTableView.register(LogCell.self, forCellReuseIdentifier: self.logCellReuseID)
        self.graphView.start()

        self.configureOscTextFields()
        self.startLogFlushTimer()
        self.loadOscSettings()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Warm up iOS' lazy text-input subsystem so the first tap into an OSC
        // text field doesn't stall the main thread. The OSC UDP connection
        // self-warms as soon as it reaches `.ready` (see OSCSender), so there
        // is no VC-side OSC warm-up to do here.
        guard !hasWarmedUpSubsystems else { return }
        hasWarmedUpSubsystems = true
        warmUpTextInputSystem()
    }

    // MARK: - OSC text field configuration

    private func configureOscTextFields() {
        for field in [oscHostField, oscPortField] {
            guard let field = field else { continue }
            field.delegate = self
            field.autocorrectionType = .no
            field.autocapitalizationType = .none
            field.spellCheckingType = .no
            field.smartDashesType = .no
            field.smartQuotesType = .no
            field.smartInsertDeleteType = .no
            // Nil content type prevents iOS from running autofill / contextual
            // lookups on the values (which is what slows first-tap down).
            field.textContentType = nil
            field.inputAssistantItem.leadingBarButtonGroups = []
            field.inputAssistantItem.trailingBarButtonGroups = []
            field.inputAccessoryView = makeKeyboardAccessoryView()
        }

        // Tap outside a text field to dismiss the keyboard.
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
    }

    private func makeKeyboardAccessoryView() -> UIView {
        // UIToolbar as inputAccessoryView produces a spurious
        // "Unable to simultaneously satisfy constraints" log because its
        // private button-bar wrapper is sized with an encapsulated width of 0
        // at first measurement. Using a plain UIView containing a single
        // UIButton sidesteps that entirely.
        let container = UIView(frame: CGRect(x: 0, y: 0,
                                              width: UIScreen.main.bounds.width,
                                              height: 44))
        container.autoresizingMask = [.flexibleWidth]
        container.backgroundColor = UIColor.systemGray6

        let separator = UIView()
        separator.backgroundColor = UIColor.separator
        separator.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(separator)

        let button = UIButton(type: .system)
        button.setTitle("Done", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        button.addTarget(self, action: #selector(dismissKeyboard), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(button)

        NSLayoutConstraint.activate([
            separator.topAnchor.constraint(equalTo: container.topAnchor),
            separator.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            separator.heightAnchor.constraint(equalToConstant: 0.5),

            button.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            button.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])

        return container
    }

    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }

    // MARK: - UITextFieldDelegate

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }

    func textField(_ textField: UITextField,
                   shouldChangeCharactersIn range: NSRange,
                   replacementString string: String) -> Bool {
        // The decimalPad keyboard inserts the user's locale decimal separator
        // (e.g. "," in many European locales). Force it to always be "." so
        // IP addresses parse correctly regardless of device locale.
        guard textField === oscHostField, string.contains(",") else { return true }
        let normalized = string.replacingOccurrences(of: ",", with: ".")
        let currentText = textField.text ?? ""
        guard let textRange = Range(range, in: currentText) else { return false }
        textField.text = currentText.replacingCharacters(in: textRange, with: normalized)
        let newOffset = range.location + normalized.count
        if let caret = textField.position(from: textField.beginningOfDocument, offset: newOffset) {
            textField.selectedTextRange = textField.textRange(from: caret, to: caret)
        }
        textField.sendActions(for: .editingChanged)
        return false
    }

    // MARK: - Warm-up

    private func warmUpTextInputSystem() {
        // Briefly install and tear down a hidden text field so iOS runs its
        // RTIInputSystemClient / keyboard-daemon handshake here (where we can
        // absorb the cost) instead of during the user's first tap.
        let warmup = UITextField(frame: .zero)
        warmup.isHidden = true
        view.addSubview(warmup)
        warmup.becomeFirstResponder()
        warmup.resignFirstResponder()
        warmup.removeFromSuperview()
    }

    // MARK: - OSC settings

    private func loadOscSettings() {
        let defaults = UserDefaults.standard
        let host = defaults.string(forKey: OSCDefaults.host) ?? OSCDefaults.defaultHost
        let storedPort = defaults.object(forKey: OSCDefaults.port) as? Int
        let port = UInt16(clamping: storedPort ?? Int(OSCDefaults.defaultPort))
        let enabled = defaults.bool(forKey: OSCDefaults.enabled)

        self.oscHostField?.text = host
        self.oscPortField?.text = String(port)
        self.oscEnabledSwitch?.isOn = enabled
        self.oscEnabledCached = enabled
        self.lastAppliedHost = host
        self.lastAppliedPort = port
        self.lastAppliedEnabled = enabled

        self.oscSender = OSCSender(host: host, port: port)
    }

    private func currentOscHost() -> String {
        let text = self.oscHostField?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? OSCDefaults.defaultHost : text
    }

    private func currentOscPort() -> UInt16 {
        let text = self.oscPortField?.text ?? ""
        if let value = Int(text), value > 0, value <= Int(UInt16.max) {
            return UInt16(value)
        }
        return OSCDefaults.defaultPort
    }

    private func applyOscSettings() {
        let host = currentOscHost()
        let port = currentOscPort()
        let enabled = self.oscEnabledSwitch?.isOn ?? false

        // Keep the visible fields normalized so users see the value that was saved.
        if self.oscHostField?.text != host {
            self.oscHostField?.text = host
        }
        let portString = String(port)
        if self.oscPortField?.text != portString {
            self.oscPortField?.text = portString
        }
        self.oscEnabledCached = enabled

        // Only push work to the sender / cfprefsd when something actually
        // changed. Short-circuiting here makes the first switch-toggle a
        // no-op beyond flipping `oscEnabledCached`, which is what the user
        // perceives as "instant".
        let hostChanged = host != self.lastAppliedHost
        let portChanged = port != self.lastAppliedPort
        let enabledChanged = enabled != self.lastAppliedEnabled

        self.lastAppliedHost = host
        self.lastAppliedPort = port
        self.lastAppliedEnabled = enabled

        if hostChanged || portChanged {
            self.oscSender?.update(host: host, port: port)
        }

        if hostChanged || portChanged || enabledChanged {
            // UserDefaults.set goes through an XPC round-trip to cfprefsd;
            // hop off the main thread so the UI never blocks on it.
            DispatchQueue.global(qos: .utility).async {
                let defaults = UserDefaults.standard
                if hostChanged { defaults.set(host, forKey: OSCDefaults.host) }
                if portChanged { defaults.set(Int(port), forKey: OSCDefaults.port) }
                if enabledChanged { defaults.set(enabled, forKey: OSCDefaults.enabled) }
            }
        }
    }

    @IBAction func onOscHostChanged(_ sender: Any) {
        applyOscSettings()
    }

    @IBAction func onOscPortChanged(_ sender: Any) {
        applyOscSettings()
    }

    @IBAction func onOscEnabledChanged(_ sender: Any) {
        applyOscSettings()
    }
    
    func museListChanged() {
        museMap.removeAll()
        museList.removeAll()
        DispatchQueue.main.async {
            if let muses = self.museManager?.getMuses() {
                for muse in muses {
                    self.museMap[muse.getName()] = muse
                    self.museList.append(muse.getName())
                    self.log(message: "Found \(muse.getName()) with ID: \(muse.getMacAddress())")
                }
                self.musePicker.reloadAllComponents()
            }
        }
    }
    
    func numberOfComponents(in pickerView: UIPickerView) -> Int {
        return 1
    }
    
    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
        return self.museList.count
    }
    
    func pickerView(_ pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? {
        return self.museList[row]
    }
    
    func getSelectedItem(picker: UIPickerView) -> String? {
        if self.museList.isEmpty {
            return nil
        }
        let selectedRow = picker.selectedRow(inComponent: 0)
        return self.museList[selectedRow]
    }
    
    @IBAction func onScanClick(_ sender: Any) {
        self.museManager?.stopListening()
        self.museManager?.startListening()
    }
    
    @IBAction func onConnectClick(_ sender: Any) {
        guard let m = self.getSelectedItem(picker: self.musePicker),
              let muse = self.museMap[m] else {
            return
        }
        self.museManager?.stopListening()
        // All Muse object calls run on the serialization queue (museQueue
        // under the custom loop, or the current thread under the SDK loop).
        serializedWithExecute { [weak self] in
            guard let self = self else { return }
            if muse.getConnectionState() != .disconnected { return }
            muse.unregisterAllListeners()
            muse.register(self.connectionListener)
            muse.register(self.dataListener, type: .eeg)
            muse.setPreset(IXNMusePreset.preset21) // See documentation on presets
            if self.useCustomExecuteLoop {
                muse.connect()
                self.scheduleMuseTick(muse: muse)
            } else {
                // SDK-owned loop: delivers every packet on the main thread
                // at 256 Hz per IXNMuse.h. `runAsynchronously()` performs
                // the connect internally.
                muse.runAsynchronously()
            }
        }
    }

    @IBAction func onDisconnectClick(_ sender: Any) {
        guard let muses = self.museManager?.getMuses() else { return }
        for muse in muses {
            serializedWithExecute {
                if muse.getConnectionState() == .connected {
                    muse.disconnect()
                }
            }
        }
    }

    /// Kick off the execute loop for `muse`. Kept as a separate entry point
    /// so callers that already hold a Muse object (e.g. future automation
    /// paths) don't have to know which loop is in use.
    func runAsynchronously(muse: IXNMuse) {
        serializedWithExecute { [weak self] in
            guard let self = self else { return }
            if self.useCustomExecuteLoop {
                muse.connect()
                self.scheduleMuseTick(muse: muse)
            } else {
                muse.runAsynchronously()
            }
        }
    }

    private func scheduleMuseTick(muse: IXNMuse) {
        museQueue.asyncAfter(deadline: .now() + tickIntervalSecs) { [weak self] in
            self?.museTick(muse: muse)
        }
    }

    private func museTick(muse: IXNMuse) {
        // Runs on museQueue.
        muse.execute()
        if muse.getConnectionState() != .disconnected {
            scheduleMuseTick(muse: muse)
        } else {
            log(message: "Detected disconnected state... stopping async execution")
        }
    }

    // MARK: - Muse call serialization

    /// Run `work` on the queue that serializes access to any `IXNMuse`. With
    /// the custom loop that's `museQueue`; with the SDK loop there is no
    /// such serialization so we run inline on the caller's thread (usually
    /// main, which is where the SDK also delivers its callbacks).
    private func serializedWithExecute(_ work: @escaping () -> Void) {
        if useCustomExecuteLoop {
            museQueue.async(execute: work)
        } else {
            work()
        }
    }

    /// Synchronous variant for teardown paths (e.g. `deinit`) that must not
    /// return while a tick might still be in flight.
    private func serializedWithExecuteSync(_ work: () -> Void) {
        if useCustomExecuteLoop {
            museQueue.sync(execute: work)
        } else {
            work()
        }
    }
    
    func receive(_ packet: IXNMuseConnectionPacket, muse: IXNMuse?) {
        // Threading depends on `useCustomExecuteLoop`:
        //   * true  – delivered synchronously from inside `muse.execute()` on
        //             `museQueue`. `unregisterAllListeners` / `getName` are
        //             safe; UIKit / museManager work must hop to main.
        //   * false – delivered on the main thread by the SDK at the moment
        //             the connection state changes. Muse calls are serialized
        //             only with other main-thread Muse calls, not with the
        //             SDK's internal execute() thread.
        if packet.previousConnectionState == .connecting && packet.currentConnectionState == .disconnected {
            muse?.unregisterAllListeners()
            log(message: "\(muse?.getName() ?? "") disconnected")
            if useCustomExecuteLoop {
                DispatchQueue.main.async { [weak self] in
                    self?.museManager?.startListening()
                }
            } else {
                museManager?.startListening()
            }
        }
        if packet.previousConnectionState == .connecting && packet.currentConnectionState == .connected {
            log(message: "\(muse?.getName() ?? "") connected")
        }
    }
    
    func receive(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
        if packet != nil && packet!.packetType() == .eeg {
            self.graphView.addPoint(packet: packet!)
            self.sendEegPacketOverOSC(packet!)
        }
    }

    private func sendEegPacketOverOSC(_ packet: IXNMuseDataPacket) {
        guard let sender = self.oscSender, self.oscEnabledCached else {
            return
        }

        let channels: [IXNEeg] = [.EEG1, .EEG2, .EEG3, .EEG4]
        let values = channels.map { channel -> Float in
            let raw = packet.getEegChannelValue(channel)
            return raw.isNaN ? 0 : Float(raw)
        }
        sender.send(address: OSCDefaults.eegAddress, floats: values)
    }
    
    func receiveLog(_ log: IXNLogPacket) {
        // Log callbacks can arrive on a background thread at very high rates.
        // Append to a thread-safe buffer and let the flush timer coalesce the
        // work on the main thread so the UI can keep scrolling smoothly.
        let message = log.message
        logBufferLock.lock()
        pendingLogMessages.append(message)
        logBufferLock.unlock()
    }

    func log(message: String) {
        self.logManager?.writeLog(IXNSeverity.sevDebug, raw: false, tag: "", message: message)
    }

    // MARK: - Log batching

    private func startLogFlushTimer() {
        logFlushTimer?.invalidate()
        let timer = Timer(timeInterval: logFlushInterval, repeats: true) { [weak self] _ in
            self?.flushPendingLogs()
        }
        // `.common` keeps the timer firing during scroll tracking so we never
        // stop draining the log buffer while the user's finger is down.
        RunLoop.main.add(timer, forMode: .common)
        logFlushTimer = timer
    }

    private func flushPendingLogs() {
        logBufferLock.lock()
        if pendingLogMessages.isEmpty {
            logBufferLock.unlock()
            return
        }
        let batch = pendingLogMessages
        pendingLogMessages.removeAll(keepingCapacity: true)
        logBufferLock.unlock()

        let insertStart = logLines.count
        logLines.append(contentsOf: batch)

        var overflow = 0
        if logLines.count > maxLogLines {
            overflow = logLines.count - maxLogLines
            logLines.removeFirst(overflow)
        }

        if overflow > 0 {
            // Simpler (and still cheap because only visible cells re-draw)
            // than tracking the shifting index paths.
            logTableView.reloadData()
        } else {
            let newPaths = (insertStart..<insertStart + batch.count).map {
                IndexPath(row: $0, section: 0)
            }
            logTableView.performBatchUpdates({
                logTableView.insertRows(at: newPaths, with: .none)
            })
        }

        if shouldAutoScroll && !logLines.isEmpty {
            let last = IndexPath(row: logLines.count - 1, section: 0)
            logTableView.scrollToRow(at: last, at: .bottom, animated: false)
        }
    }

    // MARK: - UITableViewDataSource / Delegate

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return logLines.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: logCellReuseID, for: indexPath)
        (cell as? LogCell)?.setMessage(logLines[indexPath.row])
        return cell
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView === logTableView else { return }
        let threshold: CGFloat = 30
        let maxOffset = max(
            0,
            scrollView.contentSize.height - scrollView.bounds.height + scrollView.adjustedContentInset.bottom
        )
        shouldAutoScroll = scrollView.contentOffset.y >= maxOffset - threshold
    }
    
    deinit {
        self.logFlushTimer?.invalidate()
        self.logFlushTimer = nil
        self.graphView?.stop()
        self.museManager?.stopListening()
        // Serialize teardown with any still-pending execute() tick on
        // museQueue (custom loop). Under the SDK loop this is a direct call
        // on the current thread.
        if let muses = self.museManager?.getMuses() {
            serializedWithExecuteSync {
                for muse in muses {
                    muse.unregisterAllListeners()
                    if muse.getConnectionState() == .connected {
                        muse.disconnect()
                    }
                }
            }
        }
    }
}

class MuseListener: IXNMuseListener {
    var parent: ViewController
    
    init(parent: ViewController){
        self.parent = parent
    }
    
    func museListChanged() {
        self.parent.museListChanged()
    }
}

class ConnectionListener: IXNMuseConnectionListener {
    var parent: ViewController
    
    init(parent: ViewController){
        self.parent = parent
    }
    
    func receive(_ packet: IXNMuseConnectionPacket, muse: IXNMuse?) {
        parent.receive(packet, muse: muse)
    }
}

class DataListener: IXNMuseDataListener {
    var parent: ViewController
    
    init(parent: ViewController){
        self.parent = parent
    }
    
    func receive(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
        parent.receive(packet, muse: muse)
    }
    
    func receive(_ packet: IXNMuseArtifactPacket, muse: IXNMuse?) {
    }
}

/// Lightweight cell for the log table. One reusable UILabel per visible row
/// keeps scroll cost independent of the total log size.
final class LogCell: UITableViewCell {
    private let label: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.font = .systemFont(ofSize: 14)
        label.adjustsFontForContentSizeCategory = false
        return label
    }()

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundColor = .clear
        contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 2),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -2),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -8),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setMessage(_ text: String) {
        label.text = text
    }
}
