# Required Info.plist privacy strings

After `npx cap sync ios`, open `ios/App/App/Info.plist` and add these two key-value pairs
(or add them in Xcode: select Info.plist → + → paste the key):

```xml
<key>NSCameraUsageDescription</key>
<string>ChefCoach uses your camera to scan fridge contents and identify ingredients.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>ChefCoach accesses your photos to identify ingredients from your fridge.</string>
```

Without these the app will crash on iOS when requesting camera / photo library access,
and Apple will reject the binary during App Store review.
