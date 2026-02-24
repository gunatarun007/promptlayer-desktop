# Changelog

## v1.1.1 (Production Release)

*   **Windows taskbar + installer icon fixed**: Converted icon to proper multi-resolution `.ico` format and embedded via proper electron-builder configuration.
*   **Proper AppUserModelID integration**: Prevents Windows from assigning generic identities, fixing taskbar grouping and icon visibility.
*   **Removed auto-close on blur**: The window now stays open until explicitly hidden.
*   **Stable desktop behavior**: Upgraded elevation rules to `alwaysOnTop: 'screen-saver'` for 2 seconds on spawn before gracefully returning to regular z-index, along with explicit toggling behavior so it doesn't vanish mid-use.
*   **First-run onboarding integrated inline**: Deprecated separate 480x600 floating setup window. Setup is now natively baked into the primary settings view, streamlining activation.
*   **API validation state hardened**: Client-server (Renderer -> Main) validation architecture. The frontend only visually reflects true state. Enhance buttons gate appropriately.
*   **Installer runAfterFinish enabled**: NSIS correctly auto-launches the application after completion.
