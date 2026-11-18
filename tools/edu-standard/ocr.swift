import Foundation
import Vision
import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let img = NSImage(contentsOf: url)!
var r = CGRect(origin: .zero, size: img.size)
let cg = img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
req.recognitionLanguages = CommandLine.arguments.count > 2 ? CommandLine.arguments[2].components(separatedBy: ",") : ["zh-Hant","ko-KR"]
try! VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
let W = Double(cg.width), H = Double(cg.height)
for o in req.results ?? [] {
  guard let c = o.topCandidates(1).first else { continue }
  let b = o.boundingBox
  print(String(format: "%.0f %.0f %.0f %.0f\t%.2f\t%@", b.minX*W, (1-b.maxY)*H, b.maxX*W, (1-b.minY)*H, c.confidence, c.string))
}
