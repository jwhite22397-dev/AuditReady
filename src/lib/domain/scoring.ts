import type { AssessmentQuestion, ResponseRecord, ReviewResult } from "./types";

export function suggestResult(question: AssessmentQuestion, response: ResponseRecord): ReviewResult | null {
  if (question.type === "yes_no" || question.type === "yes_no_na") {
    if (response.answerNa) return "na";
    if (response.answerBoolean === true) return "pass";
    if (response.answerBoolean === false) return "fail";
    return null;
  }
  if (question.type === "file_request") {
    if (response.documentIds.length > 0) return "pass";
    if (response.answerText.trim()) return "partial";
    return null;
  }
  return null;
}

export function responseLabel(question: AssessmentQuestion, response: ResponseRecord): string {
  if (question.type === "yes_no" || question.type === "yes_no_na") {
    if (response.answerNa) return "N/A";
    if (response.answerBoolean === true) return "Yes";
    if (response.answerBoolean === false) return "No";
    return "No answer";
  }
  if (question.type === "multiple_choice") return response.answerChoice || "No answer";
  if (question.type === "file_request") {
    if (response.documentIds.length > 0) return "File attached";
    if (response.answerText.trim()) return response.answerText.trim();
    return "No file";
  }
  return response.answerText.trim() || "No answer";
}

export function isAnswered(question: AssessmentQuestion, response: ResponseRecord): boolean {
  if (question.type === "yes_no") return response.answerBoolean !== null;
  if (question.type === "yes_no_na") return response.answerBoolean !== null || response.answerNa;
  if (question.type === "multiple_choice") return response.answerChoice.trim().length > 0;
  if (question.type === "file_request") return response.documentIds.length > 0 || response.answerText.trim().length > 0;
  return true;
}
