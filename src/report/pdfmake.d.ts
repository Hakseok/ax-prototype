// Minimal typing for the browser build of pdfmake 0.3 (MIT). Only the calls used by src/report/pdf.ts.
declare module 'pdfmake/build/pdfmake' {
  interface OutputDocument {
    getBlob(): Promise<Blob>;
  }
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    createPdf(doc: unknown): OutputDocument;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
