import { pdfjs } from "react-pdf"

// Load the pdf.js worker from the bundled pdfjs-dist package (matches react-pdf's
// peer version). Using import.meta.url lets the bundler emit a local worker asset,
// avoiding any external CDN dependency.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`


export { pdfjs }