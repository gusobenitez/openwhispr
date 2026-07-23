// Local, unsigned build config for `npm run pack:local`.
//
// It extends the release config in electron-builder.json but strips out code
// signing, so a developer can produce a runnable dist/win-unpacked (or the
// current platform's --dir output) WITHOUT OpenWhispr's Azure Trusted Signing
// credentials, an Apple Developer identity, or notarization.
//
// The release pipeline still uses electron-builder.json unchanged — this file
// is only referenced by the pack:local script.
const base = require("./electron-builder.json");

module.exports = {
  ...base,
  // Windows: turn signing off outright. `signExecutable: false` is the
  // electron-builder 26 switch that skips signtool/resedit entirely, and
  // nulling azureSignOptions removes the Azure Trusted Signing path (which
  // needs OpenWhispr's cloud creds + the dotnet `sign` CLI). Without this the
  // build fails or depends on a certificate being present in the machine store.
  win: {
    ...base.win,
    azureSignOptions: null,
    signExecutable: false,
  },
  // macOS: skip Developer ID signing and notarization for local builds.
  mac: {
    ...base.mac,
    identity: null,
    notarize: false,
  },
};
