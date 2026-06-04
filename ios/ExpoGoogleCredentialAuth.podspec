require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoGoogleCredentialAuth'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/sagnik2001/expo-google-credential-auth.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleSignIn', '~> 8.0'

  # Swift/Objective-C compatibility. Use `install_modules_dependencies` when
  # available (Expo SDK 51+) so the New Architecture flags are wired in.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  end

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
