const { withInfoPlist, createRunOncePlugin } = require('@expo/config-plugins');

const pkg = require('./package.json');


function reverseClientId(iosClientId) {
  return iosClientId.split('.').reverse().join('.');
}


const withGoogleCredentialAuth = (config, props = {}) => {
  const iosClientId = props && props.iosClientId;

  if (!iosClientId) {

    return config;
  }

  return withInfoPlist(config, (config) => {
    const reversed = reverseClientId(iosClientId);


    config.modResults.GIDClientID = iosClientId;

    const urlTypes = config.modResults.CFBundleURLTypes || [];
    const alreadyRegistered = urlTypes.some((entry) =>
      (entry.CFBundleURLSchemes || []).includes(reversed),
    );
    if (!alreadyRegistered) {
      urlTypes.push({ CFBundleURLSchemes: [reversed] });
    }
    config.modResults.CFBundleURLTypes = urlTypes;

    return config;
  });
};

module.exports = createRunOncePlugin(
  withGoogleCredentialAuth,
  pkg.name,
  pkg.version,
);
