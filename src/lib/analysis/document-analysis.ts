import type { DocumentType } from "@/lib/domain/types";

export interface DocumentAnalysisRequest {
  fileName: string;
  contentType: string;
  documentType: DocumentType;
}

export interface DocumentAnalysisSuggestion {
  id: string;
  title: string;
  detail: string;
}

/**
 * Future document-intelligence boundary.
 * The deterministic implementation does not read file bytes and does not invent
 * control evidence. An AI implementation can be added behind the same interface
 * when a provider is configured. The product must remain fully usable without it.
 */
export interface DocumentAnalysisService {
  readonly mode: "deterministic" | "ai";
  analyze(input: DocumentAnalysisRequest): Promise<DocumentAnalysisSuggestion[]>;
}

export class DeterministicDocumentAnalysisService implements DocumentAnalysisService {
  readonly mode = "deterministic" as const;

  async analyze(input: DocumentAnalysisRequest): Promise<DocumentAnalysisSuggestion[]> {
    const suggestions: DocumentAnalysisSuggestion[] = [
      {
        id: "analyst-review",
        title: "Analyst review required",
        detail:
          "AuditReady does not read document contents in this version. Record what you verified in the structured review fields.",
      },
    ];
    if (input.documentType === "soc2_type_i" || input.documentType === "soc2_type_ii") {
      suggestions.push({
        id: "soc2-form",
        title: "Complete the SOC 2 review fields",
        detail: "Capture the firm, period, opinion, exceptions, subservice organizations, and trust categories yourself.",
      });
    }
    return suggestions;
  }
}

export class AIEnhancedDocumentAnalysisService implements DocumentAnalysisService {
  readonly mode = "ai" as const;

  async analyze(): Promise<DocumentAnalysisSuggestion[]> {
    throw new Error("AI document analysis is not configured.");
  }
}

export function getDocumentAnalysisService(): DocumentAnalysisService {
  if (process.env.AUDITREADY_AI_PROVIDER) return new AIEnhancedDocumentAnalysisService();
  return new DeterministicDocumentAnalysisService();
}
