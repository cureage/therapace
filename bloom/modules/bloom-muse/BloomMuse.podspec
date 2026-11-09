Pod::Spec.new do |s|
  s.name           = 'BloomMuse'
  s.version        = '1.0.0'
  s.summary        = 'Native LibMuse integration for Bloom'
  s.description    = 'Uses the LibMuse SDK to discover Muse headbands and stream EEG data.'
  s.license        = { :type => 'Commercial', :text => 'See the bundled LibMuse SDK license.' }
  s.author         = 'Bloom'
  s.homepage       = 'https://choosemuse.com/'
  s.platforms      = { :ios => '15.5' }
  s.swift_version  = '5.0'
  s.source         = { :path => '.' }
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
  s.vendored_frameworks = 'ios/Muse.framework'
  s.static_framework = true
  s.frameworks     = 'CoreBluetooth', 'ExternalAccessory'
  s.libraries      = 'c++'
  s.dependency 'ExpoModulesCore'
end
