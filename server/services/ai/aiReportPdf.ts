import {
  AiReportData,
  AiFact,
  AiInsight,
  AiRecommendation,
  AiLimitation,
} from '../../../shared/types/ai.js';

interface PageStream {
  stream: string[];
}

export class AiReportPdfGenerator {
  private pages: PageStream[] = [];
  private currentPage: PageStream = { stream: [] };
  private currentY = 740;
  private readonly pageWidth = 612;
  private readonly pageHeight = 792;
  private readonly marginLeft = 40;
  private readonly marginRight = 40;
  private readonly contentWidth = 532; // 612 - 80
  private readonly marginBottom = 50;

  constructor() {
    this.startNewPage();
  }

  private startNewPage() {
    if (this.currentPage.stream.length > 0) {
      this.pages.push(this.currentPage);
    }
    this.currentPage = { stream: [] };
    this.currentY = 740;
  }

  private checkPageBreak(requiredHeight: number) {
    if (this.currentY - requiredHeight < this.marginBottom) {
      this.startNewPage();
    }
  }

  private escapePdfText(text: string): string {
    if (!text) return '';
    // Replace special chars, convert non-ascii to ascii equivalents
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2022/g, '*')
      .replace(/[^\x20-\x7E\r\n\t]/g, ' ');
  }

  private drawText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    font: 'F1' | 'F2' | 'F3' = 'F1', // F1: Helvetica, F2: Helvetica-Bold, F3: Helvetica-Oblique
    color: [number, number, number] = [0.12, 0.16, 0.23] // RGB [0-1]
  ) {
    const escaped = this.escapePdfText(text);
    const [r, g, b] = color;
    this.currentPage.stream.push(
      `q ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg BT /${font} ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET Q`
    );
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  private drawParagraph(
    text: string,
    x: number,
    fontSize: number,
    maxChars: number,
    lineHeight: number,
    font: 'F1' | 'F2' | 'F3' = 'F1',
    color: [number, number, number] = [0.12, 0.16, 0.23]
  ): number {
    const lines = this.wrapText(text, maxChars);
    for (const line of lines) {
      this.checkPageBreak(lineHeight + 5);
      this.drawText(line, x, this.currentY, fontSize, font, color);
      this.currentY -= lineHeight;
    }
    return lines.length * lineHeight;
  }

  private drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor?: [number, number, number],
    strokeColor?: [number, number, number],
    lineWidth: number = 1
  ) {
    let ops = 'q ';
    if (fillColor) {
      const [r, g, b] = fillColor;
      ops += `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg `;
    }
    if (strokeColor) {
      const [r, g, b] = strokeColor;
      ops += `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${lineWidth} w `;
    }
    ops += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    if (fillColor && strokeColor) {
      ops += 'B Q';
    } else if (fillColor) {
      ops += 'f Q';
    } else if (strokeColor) {
      ops += 'S Q';
    } else {
      ops += 'n Q';
    }
    this.currentPage.stream.push(ops);
  }

  private drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: [number, number, number] = [0.85, 0.88, 0.92],
    width = 1
  ) {
    const [r, g, b] = color;
    this.currentPage.stream.push(
      `q ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`
    );
  }

  /**
   * Generates a fully formed PDF Buffer from report data
   */
  public generate(report: AiReportData): Buffer {
    // 1. Header Banner
    this.renderHeader(report);

    // 2. Metadata & Traceability Card
    this.renderMetadataCard(report);

    // 3. Question & Executive Summary
    this.renderExecutiveSummary(report);

    // 4. Verified Facts Table
    if (report.facts && report.facts.length > 0) {
      this.renderFactsSection(report.facts);
    }

    // 5. Insights & Correlations
    if (report.insights && report.insights.length > 0) {
      this.renderInsightsSection(report.insights);
    }

    // 6. Actionable Recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      this.renderRecommendationsSection(report.recommendations);
    }

    // 7. Data Limitations & Scope
    this.renderLimitationsSection(report.dataLimitations, report.metadata);

    // Push the final page
    if (this.currentPage.stream.length > 0) {
      this.pages.push(this.currentPage);
    }

    // 8. Add Footers on all pages with correct page counts
    const totalPages = Math.max(1, this.pages.length);
    for (let i = 0; i < totalPages; i++) {
      this.renderFooter(this.pages[i], i + 1, totalPages, report);
    }

    // 9. Build final PDF binary buffer
    return this.buildPdfDocument();
  }

  private renderHeader(report: AiReportData) {
    // Top Bar
    this.drawRect(this.marginLeft, this.currentY - 32, this.contentWidth, 42, [0.06, 0.12, 0.24]);
    this.drawText('COMMUNITY INTELLIGENCE REPORT', this.marginLeft + 12, this.currentY - 14, 10, 'F2', [0.58, 0.77, 0.99]);
    this.drawText(
      this.escapePdfText(report.metadata.communityName || 'Community Report'),
      this.marginLeft + 12,
      this.currentY - 26,
      14,
      'F2',
      [1, 1, 1]
    );

    // Right-aligned status badge in header
    const state = report.generationState || 'COMPLETED';
    const stateColor: [number, number, number] =
      state === 'COMPLETED'
        ? [0.13, 0.77, 0.37]
        : state === 'INSUFFICIENT_DATA'
        ? [0.96, 0.62, 0.04]
        : [0.94, 0.27, 0.24];

    this.drawText(`STATUS: ${state}`, this.marginLeft + this.contentWidth - 140, this.currentY - 22, 9, 'F2', stateColor);

    this.currentY -= 48;

    // Report Title
    this.drawText(report.title || 'AI Intelligence & Insights Export', this.marginLeft, this.currentY, 16, 'F2', [0.06, 0.09, 0.16]);
    this.currentY -= 20;
  }

  private renderMetadataCard(report: AiReportData) {
    this.checkPageBreak(75);
    const boxHeight = 64;
    const boxY = this.currentY - boxHeight;

    this.drawRect(this.marginLeft, boxY, this.contentWidth, boxHeight, [0.96, 0.98, 1.0], [0.82, 0.88, 0.96]);

    const col1X = this.marginLeft + 12;
    const col2X = this.marginLeft + 190;
    const col3X = this.marginLeft + 370;

    // Row 1
    this.drawText('OBSERVATION WINDOW', col1X, boxY + 48, 7, 'F2', [0.4, 0.48, 0.58]);
    this.drawText(report.metadata.observationPeriod || 'N/A', col1X, boxY + 36, 9, 'F1', [0.1, 0.14, 0.2]);

    this.drawText('COMPARISON PERIOD', col2X, boxY + 48, 7, 'F2', [0.4, 0.48, 0.58]);
    this.drawText(report.metadata.comparisonPeriod || 'Prior Consecutive Window', col2X, boxY + 36, 9, 'F1', [0.1, 0.14, 0.2]);

    this.drawText('DATA COVERAGE', col3X, boxY + 48, 7, 'F2', [0.4, 0.48, 0.58]);
    const cov = report.metadata.traceability?.dataCoverage || (report.metadata.isPartialData ? 'PARTIAL' : 'FULL');
    this.drawText(cov, col3X, boxY + 36, 9, 'F2', [0.1, 0.5, 0.25]);

    // Row 2
    this.drawText('GENERATED TIMESTAMP', col1X, boxY + 20, 7, 'F2', [0.4, 0.48, 0.58]);
    this.drawText(new Date(report.metadata.generatedAt).toUTCString(), col1X, boxY + 8, 8, 'F1', [0.2, 0.24, 0.3]);

    this.drawText('SOURCE / SCOPE', col2X, boxY + 20, 7, 'F2', [0.4, 0.48, 0.58]);
    this.drawText(
      `${report.metadata.sourceType} (${report.metadata.dataScope || 'TENANT_TELEMETRY'})`,
      col2X,
      boxY + 8,
      8,
      'F1',
      [0.2, 0.24, 0.3]
    );

    this.drawText('ACTOR ROLE', col3X, boxY + 20, 7, 'F2', [0.4, 0.48, 0.58]);
    this.drawText(report.metadata.generatedByRole || 'AUTHENTICATED', col3X, boxY + 8, 8, 'F1', [0.2, 0.24, 0.3]);

    this.currentY -= (boxHeight + 16);
  }

  private renderExecutiveSummary(report: AiReportData) {
    if (report.analysisQuestion) {
      this.checkPageBreak(40);
      this.drawText('INQUIRY / OBJECTIVE', this.marginLeft, this.currentY, 9, 'F2', [0.35, 0.42, 0.52]);
      this.currentY -= 14;
      this.drawParagraph(`"${report.analysisQuestion}"`, this.marginLeft + 6, 10, 85, 14, 'F3', [0.12, 0.18, 0.28]);
      this.currentY -= 8;
    }

    if (report.summaryAnswer) {
      this.checkPageBreak(50);
      this.drawText('SYNTHESIS & FINDINGS', this.marginLeft, this.currentY, 11, 'F2', [0.06, 0.1, 0.18]);
      this.currentY -= 14;
      this.drawParagraph(report.summaryAnswer, this.marginLeft, 9.5, 88, 14, 'F1', [0.15, 0.2, 0.28]);
      this.currentY -= 12;
    }
  }

  private renderFactsSection(facts: AiFact[]) {
    this.checkPageBreak(60);
    this.drawText('VERIFIED TELEMETRY FACTS', this.marginLeft, this.currentY, 11, 'F2', [0.06, 0.1, 0.18]);
    this.drawText('Immutable calculations from authoritative tenant records', this.marginLeft + 180, this.currentY, 8, 'F3', [0.45, 0.5, 0.58]);
    this.currentY -= 14;

    // Table Header
    const colMetric = this.marginLeft + 6;
    const colVal = this.marginLeft + 190;
    const colPrev = this.marginLeft + 280;
    const colDelta = this.marginLeft + 360;
    const colSource = this.marginLeft + 440;

    this.drawRect(this.marginLeft, this.currentY - 14, this.contentWidth, 18, [0.93, 0.95, 0.98]);
    this.drawText('METRIC', colMetric, this.currentY - 10, 7.5, 'F2', [0.2, 0.28, 0.38]);
    this.drawText('CURRENT VALUE', colVal, this.currentY - 10, 7.5, 'F2', [0.2, 0.28, 0.38]);
    this.drawText('PREVIOUS', colPrev, this.currentY - 10, 7.5, 'F2', [0.2, 0.28, 0.38]);
    this.drawText('DELTA', colDelta, this.currentY - 10, 7.5, 'F2', [0.2, 0.28, 0.38]);
    this.drawText('SOURCE / DOMAIN', colSource, this.currentY - 10, 7.5, 'F2', [0.2, 0.28, 0.38]);
    this.currentY -= 18;

    facts.forEach((fact, idx) => {
      this.checkPageBreak(22);
      const isEven = idx % 2 === 0;
      if (isEven) {
        this.drawRect(this.marginLeft, this.currentY - 14, this.contentWidth, 18, [0.98, 0.99, 1.0]);
      }

      this.drawText(fact.metric || fact.category || 'Metric', colMetric, this.currentY - 10, 8, 'F2', [0.1, 0.15, 0.22]);
      this.drawText(String(fact.value ?? 'N/A'), colVal, this.currentY - 10, 8, 'F1', [0.1, 0.15, 0.22]);
      this.drawText(fact.previousValue !== null && fact.previousValue !== undefined ? String(fact.previousValue) : '-', colPrev, this.currentY - 10, 8, 'F1', [0.4, 0.45, 0.52]);

      const deltaNum = typeof fact.delta === 'number' ? fact.delta : Number(fact.delta);
      const isNumericDelta = !isNaN(deltaNum) && fact.delta !== null && fact.delta !== undefined;
      const deltaStr = isNumericDelta ? `${deltaNum > 0 ? '+' : ''}${deltaNum}` : '-';
      const deltaColor: [number, number, number] = isNumericDelta
        ? deltaNum > 0
          ? [0.1, 0.55, 0.2]
          : deltaNum < 0
          ? [0.8, 0.2, 0.2]
          : [0.4, 0.4, 0.4]
        : [0.4, 0.4, 0.4];
      this.drawText(deltaStr, colDelta, this.currentY - 10, 8, 'F2', deltaColor);

      const src = `${fact.source || 'Engine'} (${fact.category || 'GEN'})`;
      this.drawText(src, colSource, this.currentY - 10, 7.5, 'F1', [0.35, 0.4, 0.48]);

      this.currentY -= 18;
    });

    this.currentY -= 10;
  }

  private renderInsightsSection(insights: AiInsight[]) {
    this.checkPageBreak(50);
    this.drawText('SUPPORTING INSIGHTS & EXPLANATIONS', this.marginLeft, this.currentY, 11, 'F2', [0.06, 0.1, 0.18]);
    this.currentY -= 16;

    for (const insight of insights) {
      this.checkPageBreak(45);
      const evType = insight.evidenceType || 'VERIFIED_FACT';
      const badgeColor: [number, number, number] =
        evType === 'VERIFIED_FACT'
          ? [0.1, 0.55, 0.2]
          : evType === 'OBSERVED_CORRELATION'
          ? [0.2, 0.45, 0.8]
          : [0.75, 0.45, 0.1];

      // Bullet & Category
      this.drawText(`[${evType.replace(/_/g, ' ')}]`, this.marginLeft, this.currentY, 7.5, 'F2', badgeColor);
      this.drawText(insight.category, this.marginLeft + 130, this.currentY, 7.5, 'F2', [0.4, 0.45, 0.52]);
      this.currentY -= 12;

      // Observation
      this.drawParagraph(`Observation: ${insight.observation}`, this.marginLeft + 6, 8.5, 86, 12, 'F2', [0.12, 0.16, 0.24]);

      // Evidence & Root Cause
      if (insight.evidence) {
        this.drawParagraph(`Evidence: ${insight.evidence}`, this.marginLeft + 6, 8, 88, 11, 'F1', [0.3, 0.35, 0.42]);
      }
      if (insight.whyItLikelyHappened) {
        this.drawParagraph(`Likely Cause: ${insight.whyItLikelyHappened}`, this.marginLeft + 6, 8, 88, 11, 'F3', [0.25, 0.3, 0.38]);
      }
      if (insight.opportunityOrRisk) {
        this.drawParagraph(`Strategic Flag: ${insight.opportunityOrRisk}`, this.marginLeft + 6, 8, 88, 11, 'F1', [0.65, 0.3, 0.1]);
      }

      this.currentY -= 6;
      this.drawLine(this.marginLeft, this.currentY, this.marginLeft + this.contentWidth, this.currentY, [0.92, 0.94, 0.96], 0.5);
      this.currentY -= 8;
    }
  }

  private renderRecommendationsSection(recommendations: AiRecommendation[]) {
    this.checkPageBreak(50);
    this.drawText('PRIORITIZED ACTIONABLE RECOMMENDATIONS', this.marginLeft, this.currentY, 11, 'F2', [0.06, 0.1, 0.18]);
    this.currentY -= 16;

    for (const rec of recommendations) {
      this.checkPageBreak(55);
      const prioColor: [number, number, number] =
        rec.priority === 'CRITICAL' || rec.priority === 'HIGH'
          ? [0.8, 0.15, 0.15]
          : rec.priority === 'MEDIUM'
          ? [0.8, 0.5, 0.1]
          : [0.1, 0.5, 0.2];

      this.drawText(`[${rec.priority} PRIORITY]`, this.marginLeft, this.currentY, 7.5, 'F2', prioColor);
      this.drawText(`Module: ${rec.affectedModule} | Confidence: ${rec.confidence}`, this.marginLeft + 110, this.currentY, 7.5, 'F1', [0.4, 0.45, 0.5]);
      this.currentY -= 12;

      this.drawParagraph(rec.title, this.marginLeft + 6, 9, 85, 12, 'F2', [0.1, 0.14, 0.22]);
      if (rec.rationale || rec.reason) {
        this.drawParagraph(`Rationale: ${rec.rationale || rec.reason}`, this.marginLeft + 6, 8, 88, 11, 'F1', [0.3, 0.35, 0.42]);
      }
      if (rec.suggestedNextStep) {
        this.drawParagraph(`Next Step: ${rec.suggestedNextStep}`, this.marginLeft + 6, 8, 88, 11, 'F2', [0.15, 0.4, 0.7]);
      }

      this.currentY -= 6;
      this.drawLine(this.marginLeft, this.currentY, this.marginLeft + this.contentWidth, this.currentY, [0.92, 0.94, 0.96], 0.5);
      this.currentY -= 8;
    }
  }

  private renderLimitationsSection(limitations: AiLimitation[] | string[], metadata: AiReportData['metadata']) {
    this.checkPageBreak(60);
    this.drawText('AUDIT, INTEGRITY & DATA LIMITATIONS', this.marginLeft, this.currentY, 10, 'F2', [0.3, 0.35, 0.45]);
    this.currentY -= 14;

    const notes: string[] = [];
    if (Array.isArray(limitations)) {
      limitations.forEach((l) => {
        if (typeof l === 'string') {
          notes.push(l);
        } else if (l && typeof l === 'object') {
          notes.push(`${l.topic}: ${l.reason}`);
        }
      });
    }

    if (notes.length === 0) {
      notes.push('All telemetry queries executed with full tenant boundary isolation and data coverage.');
    }
    notes.push('Prohibitions: Discord tokens, OAuth credentials, and system prompts are strictly excluded.');
    notes.push(`Report ID: ${metadata.communityId}_${new Date(metadata.generatedAt).getTime()}`);

    for (const note of notes) {
      this.checkPageBreak(18);
      this.drawParagraph(`- ${note}`, this.marginLeft + 4, 7.5, 95, 10, 'F1', [0.45, 0.5, 0.58]);
      this.currentY -= 2;
    }
  }

  private renderFooter(page: PageStream, pageNum: number, totalPages: number, report: AiReportData) {
    const footerY = 28;
    const [r, g, b] = [0.5, 0.55, 0.62];
    const leftText = `Community Manager Intelligence | Confidential | Tenant: ${this.escapePdfText(report.metadata.communityId)}`;
    const rightText = `Page ${pageNum} of ${totalPages}`;

    page.stream.push(
      `q 0.85 0.88 0.92 RG 0.5 w ${this.marginLeft} 38 m ${this.marginLeft + this.contentWidth} 38 l S Q`
    );
    page.stream.push(
      `q ${r} ${g} ${b} rg BT /F1 7.5 Tf ${this.marginLeft} ${footerY} Td (${this.escapePdfText(leftText)}) Tj ET Q`
    );
    page.stream.push(
      `q ${r} ${g} ${b} rg BT /F1 7.5 Tf ${this.marginLeft + this.contentWidth - 60} ${footerY} Td (${rightText}) Tj ET Q`
    );
  }

  /**
   * Encodes all page objects, fonts, and streams into standard PDF 1.4 syntax
   */
  private buildPdfDocument(): Buffer {
    const objects: string[] = [];
    const offsets: number[] = [];

    // Header
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

    const addObject = (content: string): number => {
      offsets.push(Buffer.byteLength(pdf, 'utf-8'));
      const objNum = objects.length + 1;
      const objStr = `${objNum} 0 obj\n${content}\nendobj\n`;
      pdf += objStr;
      objects.push(objStr);
      return objNum;
    };

    // Object 1: Catalog
    // Object 2: Pages container
    // Object 3: Font F1 (Helvetica)
    // Object 4: Font F2 (Helvetica-Bold)
    // Object 5: Font F3 (Helvetica-Oblique)

    // Reserve IDs
    const catalogId = 1;
    const pagesId = 2;
    const fontF1Id = 3;
    const fontF2Id = 4;
    const fontF3Id = 5;

    const pageCount = this.pages.length;
    const pageObjIds: number[] = [];

    // Calculate object IDs for pages and content streams
    let nextId = 6;
    for (let i = 0; i < pageCount; i++) {
      pageObjIds.push(nextId++); // Page obj
      nextId++; // Content stream obj
    }

    // Write 1: Catalog
    addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    // Write 2: Pages
    const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
    addObject(`<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageCount} >>`);

    // Write 3: Font F1
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);

    // Write 4: Font F2
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

    // Write 5: Font F3
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);

    // Write Pages and Content streams
    for (let i = 0; i < pageCount; i++) {
      const pageStream = this.pages[i];
      const content = pageStream.stream.join('\n');
      const streamLength = Buffer.byteLength(content, 'utf-8');

      const contentStreamObjId = pageObjIds[i] + 1;

      // Page Object
      addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [ 0 0 ${this.pageWidth} ${this.pageHeight} ] /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R /F3 ${fontF3Id} 0 R >> >> /Contents ${contentStreamObjId} 0 R >>`
      );

      // Content Stream Object
      addObject(`<< /Length ${streamLength} >>\nstream\n${content}\nendstream`);
    }

    // XRef Table
    const startXref = Buffer.byteLength(pdf, 'utf-8');
    const totalObjs = objects.length + 1;

    let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
    for (let i = 0; i < offsets.length; i++) {
      const offsetStr = offsets[i].toString().padStart(10, '0');
      xref += `${offsetStr} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${totalObjs} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
    pdf += xref + trailer;

    return Buffer.from(pdf, 'utf-8');
  }
}
