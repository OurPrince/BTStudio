# BTStudio (Better Studio) v1.0

A high-performance productivity engine for Google AI Studio designed to eliminate workflow interruptions, optimize resource usage, and modernize the user interface.

---

## Technical Core Components

### 1. Advanced Content Bypass (Filter Neutralization)
BTStudio employs a multi-layered approach to ensure your generated content remains accessible and visible, even when content filters are triggered.

*   **Native Interception (Recommended)**: Operates at the network layer to intercept XHR/SSE streams. By rewriting model metadata (STOP codes) before the Angular application processes them, it ensures a flicker-free experience where the "Content Blocked" banner never even has a chance to render.
*   **DOM Restoration (Legacy)**: A fallback mechanism using a high-priority `MutationObserver`. It detects blocked turns in real-time and programmatically simulates a restoration sequence (Capture → Edit → Restore) to persist blocked content in the current session.

### 2. Chat Optimizer (LTC — Long-Thread Catalyst)
Optimizes browser performance during extended sessions by managing the DOM footprint of massive chat histories.

*   **Smart Buffering**: Automatically detaches older chat turns from the DOM when they are not in view. This preserves browser memory and eliminates UI lag (60 FPS scrolling) while allowing instant history restoration.
*   **Physical Cleanup**: For extreme performance requirements, this mode permanently purges older turns from the session memory, keeping the AI Studio environment lightweight.
*   **Auto-Limit**: Intelligent threshold management that automatically triggers optimizations based on customizable turn counts.

### 3. Modern Material 3 Interface
A complete visual overhaul that integrates seamlessly with the new Gemini 3 design language.

*   **Native Injection**: BTStudio settings are injected directly into the Gemini "Run settings" sidebar after the System Instructions panel for a distraction-free workflow.
*   **Premium Aesthetic**: Features custom-engineered UI components, including the **Comet Aura** donation banner — a JS-driven, frame-perfect animated border with soft-fading edges and a dynamic rainbow glow.
*   **Enhanced Toggles**: Custom-styled Material 3 switches and sliders for precise control over extension behavior.

---

## Installation

BTStudio is distributed as an unpacked developer extension to maintain maximum transparency and performance.

1.  Clone this repository or download and extract the ZIP archive.
2.  Navigate to `chrome://extensions` in your browser.
3.  Enable **Developer Mode** (toggle in the top-right corner).
4.  Click **Load unpacked** and select the directory containing the BTStudio files.
5.  Refresh [aistudio.google.com](https://aistudio.google.com/) — the BTStudio entry point will appear in the "Run settings" sidebar.

---

## Design Philosophy
BTStudio follows the "Invisible Tool" principle: optimization should be felt, not seen. Every modification is designed to feel like a native part of the Google ecosystem, utilizing standard CSS tokens and Material 3 design patterns.

---

*Unofficial extension. Not affiliated with Google or AI Studio.*
