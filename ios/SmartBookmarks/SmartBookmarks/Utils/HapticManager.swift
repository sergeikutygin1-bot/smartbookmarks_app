import UIKit

/// Centralized haptic feedback manager
/// Provides convenient methods for triggering haptic feedback throughout the app
final class HapticManager {
    static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let notification = UINotificationFeedbackGenerator()
    private let selectionGenerator = UISelectionFeedbackGenerator()

    private init() {
        // Prepare generators for lower latency
        impactLight.prepare()
        impactMedium.prepare()
        notification.prepare()
        selectionGenerator.prepare()
    }

    // MARK: - Impact Feedback

    /// Light impact for subtle interactions (e.g., button taps, selections)
    func light() {
        impactLight.impactOccurred()
        impactLight.prepare()
    }

    /// Medium impact for standard interactions (e.g., toggle switches, refreshes)
    func medium() {
        impactMedium.impactOccurred()
        impactMedium.prepare()
    }

    /// Heavy impact for significant actions (e.g., deletions, major state changes)
    func heavy() {
        impactHeavy.impactOccurred()
        impactHeavy.prepare()
    }

    // MARK: - Selection Feedback

    /// Selection change feedback (e.g., scrolling through pickers, selecting items)
    func selection() {
        selectionGenerator.selectionChanged()
        selectionGenerator.prepare()
    }

    // MARK: - Notification Feedback

    /// Success feedback (e.g., save completed, enrichment succeeded)
    func success() {
        notification.notificationOccurred(.success)
        notification.prepare()
    }

    /// Warning feedback (e.g., validation errors, partial failures)
    func warning() {
        notification.notificationOccurred(.warning)
        notification.prepare()
    }

    /// Error feedback (e.g., save failed, network error)
    func error() {
        notification.notificationOccurred(.error)
        notification.prepare()
    }
}

// MARK: - SwiftUI Extension

import SwiftUI

extension View {
    /// Trigger haptic feedback when a condition changes
    func hapticFeedback(_ type: HapticFeedbackType, trigger: some Equatable) -> some View {
        self.onChange(of: trigger) { _, _ in
            type.trigger()
        }
    }
}

enum HapticFeedbackType {
    case light
    case medium
    case heavy
    case selection
    case success
    case warning
    case error

    func trigger() {
        switch self {
        case .light: HapticManager.shared.light()
        case .medium: HapticManager.shared.medium()
        case .heavy: HapticManager.shared.heavy()
        case .selection: HapticManager.shared.selection()
        case .success: HapticManager.shared.success()
        case .warning: HapticManager.shared.warning()
        case .error: HapticManager.shared.error()
        }
    }
}
