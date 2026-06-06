# iPhone-Only (disable iPad support)

After running `npx cap sync ios`, open `ios/App/App.xcodeproj` in Xcode, select the **App** target → **General** → under **Deployment Info**, uncheck **iPad** in the list of supported devices.

Alternatively, in `ios/App/App/Info.plist`, ensure only the iPhone orientations are listed under `UISupportedInterfaceOrientations` and there is NO `UISupportedInterfaceOrientations~iPad` key.
