import Foundation
import PDFKit
import AppKit

// Native macOS renderer, used when Poppler is not installed. Every PDF page
// gets a PNG and extracted text for a review of layout and immutable content.
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "pdf" }
var report: [[String: Any]] = []
for file in files {
    guard let pdf = PDFDocument(url: file) else { fatalError("Cannot read \(file.lastPathComponent)") }
    let prefix = file.deletingPathExtension().lastPathComponent + "-"
    for previous in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where previous.pathExtension == "png" && previous.lastPathComponent.hasPrefix(prefix) {
        try FileManager.default.removeItem(at: previous)
    }
    var text = ""
    for index in 0..<pdf.pageCount {
        guard let page = pdf.page(at: index) else { fatalError("Missing page") }
        let pageText = page.string ?? ""
        let body = pageText.replacingOccurrences(of: "Corretor Copilot · Demonstração · \\d+/\\d+", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty && pageText.contains("Demonstração") else { fatalError("Empty page or missing footer in \(file.lastPathComponent)") }
        let bounds = page.bounds(for: .mediaBox)
        guard abs(bounds.width - 595.28) < 2 && abs(bounds.height - 841.89) < 2 else { fatalError("Expected A4") }
        let image = page.thumbnail(of: NSSize(width: bounds.width * 1.5, height: bounds.height * 1.5), for: .mediaBox)
        guard let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot render") }
        let name = "\(file.deletingPathExtension().lastPathComponent)-\(index + 1).png"
        try png.write(to: directory.appendingPathComponent(name))
        text += "\nPAGE \(index + 1)\n" + (page.string ?? "")
    }
    try text.write(to: file.deletingPathExtension().appendingPathExtension("txt"), atomically: true, encoding: .utf8)
    report.append(["file": file.lastPathComponent, "pages": pdf.pageCount, "a4": true, "footerOnEveryPage": true, "noEmptyPages": true])
}
let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try json.write(to: directory.appendingPathComponent("render-evidence.json"))
print(String(data: json, encoding: .utf8)!)
