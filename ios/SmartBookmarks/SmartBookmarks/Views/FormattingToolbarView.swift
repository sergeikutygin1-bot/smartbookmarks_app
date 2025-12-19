import SwiftUI
import UIKit

/// Apple Notes-style formatting toolbar for RichTextEditor
/// Provides text style controls (Title, Heading, Subheading, Body) and formatting buttons (Bold, Italic, Underline, Lists)
class FormattingToolbarView: UIView {

    // MARK: - Callbacks

    var onStyleSelected: ((TextStyle) -> Void)?
    var onBoldTapped: (() -> Void)?
    var onItalicTapped: (() -> Void)?
    var onUnderlineTapped: (() -> Void)?
    var onBulletListTapped: (() -> Void)?
    var onNumberedListTapped: (() -> Void)?
    var onDoneTapped: (() -> Void)?

    // MARK: - Text Styles

    enum TextStyle: Int {
        case body = 0
        case title = 1
        case heading = 2
        case subheading = 3

        var displayName: String {
            switch self {
            case .body: return "Body"
            case .title: return "Title"
            case .heading: return "Heading"
            case .subheading: return "Subheading"
            }
        }

        var fontSize: CGFloat {
            switch self {
            case .body: return 16
            case .title: return 28
            case .heading: return 24
            case .subheading: return 20
            }
        }

        var isBold: Bool {
            switch self {
            case .body: return false
            case .title, .heading, .subheading: return true
            }
        }

        var markdownPrefix: String {
            switch self {
            case .body: return ""
            case .title: return "# "
            case .heading: return "## "
            case .subheading: return "### "
            }
        }
    }

    // MARK: - UI Components

    private let styleSegmentedControl: UISegmentedControl = {
        let control = UISegmentedControl(items: [
            TextStyle.body.displayName,
            TextStyle.title.displayName,
            TextStyle.heading.displayName,
            TextStyle.subheading.displayName
        ])
        control.selectedSegmentIndex = 0
        control.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        control.selectedSegmentTintColor = UIColor.systemYellow
        control.setTitleTextAttributes([
            .foregroundColor: UIColor.white,
            .font: UIFont.systemFont(ofSize: 13, weight: .medium)
        ], for: .normal)
        control.setTitleTextAttributes([
            .foregroundColor: UIColor.black,
            .font: UIFont.systemFont(ofSize: 13, weight: .semibold)
        ], for: .selected)
        return control
    }()

    private let boldButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("B", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .bold)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        button.layer.cornerRadius = 8
        button.tag = 0
        return button
    }()

    private let italicButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("I", for: .normal)
        button.titleLabel?.font = UIFont.italicSystemFont(ofSize: 18)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        button.layer.cornerRadius = 8
        button.tag = 1
        return button
    }()

    private let underlineButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("U", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .regular)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        button.layer.cornerRadius = 8
        button.tag = 2
        return button
    }()

    private let bulletListButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "list.bullet"), for: .normal)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        button.layer.cornerRadius = 8
        button.tag = 3
        return button
    }()

    private let numberedListButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "list.number"), for: .normal)
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
        button.layer.cornerRadius = 8
        button.tag = 4
        return button
    }()

    private let doneButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("Done", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        button.tintColor = .systemBlue
        button.backgroundColor = .clear
        return button
    }()

    // MARK: - Initialization

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    // MARK: - Setup

    private func setupUI() {
        backgroundColor = UIColor(white: 0.15, alpha: 1.0)

        // Add Done button
        addSubview(doneButton)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)

        // Add segmented control
        addSubview(styleSegmentedControl)
        styleSegmentedControl.translatesAutoresizingMaskIntoConstraints = false
        styleSegmentedControl.addTarget(self, action: #selector(styleChanged), for: .valueChanged)

        // Create formatting buttons stack
        let formattingStack = UIStackView(arrangedSubviews: [
            boldButton,
            italicButton,
            underlineButton,
            bulletListButton,
            numberedListButton
        ])
        formattingStack.axis = .horizontal
        formattingStack.spacing = 12
        formattingStack.distribution = .fillEqually
        formattingStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(formattingStack)

        // Add actions
        boldButton.addTarget(self, action: #selector(boldTapped), for: .touchUpInside)
        italicButton.addTarget(self, action: #selector(italicTapped), for: .touchUpInside)
        underlineButton.addTarget(self, action: #selector(underlineTapped), for: .touchUpInside)
        bulletListButton.addTarget(self, action: #selector(bulletListTapped), for: .touchUpInside)
        numberedListButton.addTarget(self, action: #selector(numberedListTapped), for: .touchUpInside)

        // Layout
        NSLayoutConstraint.activate([
            // Done button (top-right corner)
            doneButton.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            doneButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            doneButton.heightAnchor.constraint(equalToConstant: 32),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 60),

            // Segmented control (adjusted to make room for Done button)
            styleSegmentedControl.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            styleSegmentedControl.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            styleSegmentedControl.trailingAnchor.constraint(equalTo: doneButton.leadingAnchor, constant: -12),
            styleSegmentedControl.heightAnchor.constraint(equalToConstant: 32),

            // Formatting stack
            formattingStack.topAnchor.constraint(equalTo: styleSegmentedControl.bottomAnchor, constant: 12),
            formattingStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            formattingStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            formattingStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
            formattingStack.heightAnchor.constraint(equalToConstant: 40)
        ])
    }

    // MARK: - Actions

    @objc private func styleChanged() {
        guard let style = TextStyle(rawValue: styleSegmentedControl.selectedSegmentIndex) else { return }
        onStyleSelected?(style)
    }

    @objc private func boldTapped() {
        onBoldTapped?()
        toggleButtonState(boldButton)
    }

    @objc private func italicTapped() {
        onItalicTapped?()
        toggleButtonState(italicButton)
    }

    @objc private func underlineTapped() {
        onUnderlineTapped?()
        toggleButtonState(underlineButton)
    }

    @objc private func bulletListTapped() {
        onBulletListTapped?()
        flashButton(bulletListButton)
    }

    @objc private func numberedListTapped() {
        onNumberedListTapped?()
        flashButton(numberedListButton)
    }

    @objc private func doneTapped() {
        onDoneTapped?()
    }

    // MARK: - State Updates

    func updateButtonStates(isBold: Bool, isItalic: Bool, isUnderline: Bool, style: TextStyle) {
        updateButtonState(boldButton, isActive: isBold)
        updateButtonState(italicButton, isActive: isItalic)
        updateButtonState(underlineButton, isActive: isUnderline)
        styleSegmentedControl.selectedSegmentIndex = style.rawValue
    }

    private func updateButtonState(_ button: UIButton, isActive: Bool) {
        UIView.animate(withDuration: 0.15) {
            button.backgroundColor = isActive ? UIColor.systemYellow : UIColor(white: 0.2, alpha: 1.0)
            button.tintColor = isActive ? .black : .white
        }
    }

    private func toggleButtonState(_ button: UIButton) {
        let isActive = button.backgroundColor == UIColor.systemYellow
        updateButtonState(button, isActive: !isActive)
    }

    private func flashButton(_ button: UIButton) {
        UIView.animate(withDuration: 0.1, animations: {
            button.backgroundColor = UIColor.systemYellow
            button.tintColor = .black
        }) { _ in
            UIView.animate(withDuration: 0.1, delay: 0.1) {
                button.backgroundColor = UIColor(white: 0.2, alpha: 1.0)
                button.tintColor = .white
            }
        }
    }

    // MARK: - Intrinsic Size

    override var intrinsicContentSize: CGSize {
        return CGSize(width: UIView.noIntrinsicMetric, height: 100)
    }
}

// MARK: - SwiftUI Wrapper

struct FormattingToolbarRepresentable: UIViewRepresentable {
    var onStyleSelected: ((FormattingToolbarView.TextStyle) -> Void)?
    var onBoldTapped: (() -> Void)?
    var onItalicTapped: (() -> Void)?
    var onUnderlineTapped: (() -> Void)?
    var onBulletListTapped: (() -> Void)?
    var onNumberedListTapped: (() -> Void)?

    func makeUIView(context: Context) -> FormattingToolbarView {
        let toolbar = FormattingToolbarView()
        toolbar.onStyleSelected = onStyleSelected
        toolbar.onBoldTapped = onBoldTapped
        toolbar.onItalicTapped = onItalicTapped
        toolbar.onUnderlineTapped = onUnderlineTapped
        toolbar.onBulletListTapped = onBulletListTapped
        toolbar.onNumberedListTapped = onNumberedListTapped
        return toolbar
    }

    func updateUIView(_ uiView: FormattingToolbarView, context: Context) {
        uiView.onStyleSelected = onStyleSelected
        uiView.onBoldTapped = onBoldTapped
        uiView.onItalicTapped = onItalicTapped
        uiView.onUnderlineTapped = onUnderlineTapped
        uiView.onBulletListTapped = onBulletListTapped
        uiView.onNumberedListTapped = onNumberedListTapped
    }
}
