import { AppError } from "@/lib/domain/errors";
import { entitlementsFor } from "@/lib/domain/entitlements";
import { createId } from "@/lib/domain/tokens";
import type { Database, Question, QuestionnaireSection, QuestionnaireTemplate, Session } from "@/lib/domain/types";
import { questionSchema, templateSchema } from "@/lib/domain/validation";
import { QUESTION_BANK, QUESTION_SECTIONS } from "./question-bank";
import { assertCan, audit, parseInput, type EngineCtx } from "./context";

export const BUILTIN_TEMPLATE_KEY = "vendor-security-v1";

export function seedBuiltinTemplate(db: Database, organizationId: string, now: string): QuestionnaireTemplate {
  const existing = db.templates.find(
    (template) => template.organizationId === organizationId && template.builtinKey === BUILTIN_TEMPLATE_KEY && !template.archivedAt,
  );
  if (existing) return existing;
  const template: QuestionnaireTemplate = {
    id: createId(),
    organizationId,
    name: "Vendor security questionnaire",
    description:
      "A general vendor-security questionnaire. It is not a certification and it does not claim coverage of SOC 2, ISO 27001, NIST CSF, CIS, PCI DSS, or HIPAA.",
    builtinKey: BUILTIN_TEMPLATE_KEY,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.templates.push(template);
  const sectionIds = new Map<string, string>();
  QUESTION_SECTIONS.forEach((title, index) => {
    const id = createId();
    sectionIds.set(title, id);
    db.sections.push({ id, organizationId, templateId: template.id, title, sortOrder: index });
  });
  QUESTION_BANK.forEach((question, index) => {
    db.questions.push({
      id: createId(),
      organizationId,
      templateId: template.id,
      sectionId: sectionIds.get(question.section) ?? createId(),
      prompt: question.prompt,
      helpText: question.helpText ?? "",
      type: question.type,
      options: question.options ? [...question.options] : [],
      riskWeight: question.riskWeight,
      evidenceRequired: Boolean(question.evidenceRequired),
      guidance: question.guidance,
      controlRef: question.controlRef,
      mappings: question.mappings ? question.mappings.map((mapping) => ({ ...mapping })) : [],
      sortOrder: index,
      archivedAt: null,
    });
  });
  return template;
}

export function listTemplates(db: Database, session: Session) {
  const scope = assertCan(db, session, "questionnaires.read");
  return db.templates
    .filter((template) => template.organizationId === scope.org.id && !template.archivedAt)
    .map((template) => ({
      ...template,
      questionCount: db.questions.filter((question) => question.templateId === template.id && !question.archivedAt).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTemplate(db: Database, session: Session, templateId: string) {
  const scope = assertCan(db, session, "questionnaires.read");
  const template = requireTemplate(db, scope.org.id, templateId);
  const sections = db.sections
    .filter((section) => section.templateId === template.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      ...section,
      questions: db.questions
        .filter((question) => question.sectionId === section.id && !question.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  return { template, sections };
}

export function createTemplate(db: Database, session: Session, input: unknown, now: string, mode: EngineCtx["mode"]) {
  const scope = assertCan(db, session, "questionnaires.write");
  const limits = entitlementsFor(scope.org.plan, mode);
  if (!limits.customQuestionnaires) {
    throw new AppError("forbidden", "Custom questionnaires are not included in this plan.");
  }
  const parsed = parseInput(templateSchema, input);
  const template: QuestionnaireTemplate = {
    id: createId(),
    organizationId: scope.org.id,
    name: parsed.name,
    description: parsed.description,
    builtinKey: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.templates.push(template);
  const section: QuestionnaireSection = {
    id: createId(),
    organizationId: scope.org.id,
    templateId: template.id,
    title: "General",
    sortOrder: 0,
  };
  db.sections.push(section);
  audit(db, scope, {
    action: "questionnaire.created",
    entityType: "questionnaire_template",
    entityId: template.id,
    summary: `Questionnaire template ${template.name} created.`,
    now,
  });
  return template;
}

export function duplicateTemplate(db: Database, session: Session, templateId: string, now: string, mode: EngineCtx["mode"]) {
  const scope = assertCan(db, session, "questionnaires.write");
  const limits = entitlementsFor(scope.org.plan, mode);
  if (!limits.customQuestionnaires) {
    throw new AppError("forbidden", "Custom questionnaires are not included in this plan.");
  }
  const source = requireTemplate(db, scope.org.id, templateId);
  const copy: QuestionnaireTemplate = {
    ...source,
    id: createId(),
    name: `${source.name} copy`,
    builtinKey: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.templates.push(copy);
  const sectionMap = new Map<string, string>();
  for (const section of db.sections.filter((item) => item.templateId === source.id)) {
    const id = createId();
    sectionMap.set(section.id, id);
    db.sections.push({ ...section, id, templateId: copy.id });
  }
  for (const question of db.questions.filter((item) => item.templateId === source.id && !item.archivedAt)) {
    db.questions.push({
      ...question,
      id: createId(),
      templateId: copy.id,
      sectionId: sectionMap.get(question.sectionId) ?? question.sectionId,
      mappings: question.mappings.map((mapping) => ({ ...mapping })),
      options: [...question.options],
    });
  }
  audit(db, scope, {
    action: "questionnaire.duplicated",
    entityType: "questionnaire_template",
    entityId: copy.id,
    summary: `Duplicated template ${source.name}.`,
    now,
  });
  return copy;
}

export function updateTemplate(db: Database, session: Session, templateId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const template = requireTemplate(db, scope.org.id, templateId);
  const parsed = parseInput(templateSchema, input);
  template.name = parsed.name;
  template.description = parsed.description;
  template.updatedAt = now;
  audit(db, scope, {
    action: "questionnaire.updated",
    entityType: "questionnaire_template",
    entityId: template.id,
    summary: `Template ${template.name} updated. Changes apply to new assessments only.`,
    now,
  });
}

export function archiveTemplate(db: Database, session: Session, templateId: string, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const template = requireTemplate(db, scope.org.id, templateId);
  template.archivedAt = now;
  template.updatedAt = now;
  audit(db, scope, {
    action: "questionnaire.archived",
    entityType: "questionnaire_template",
    entityId: template.id,
    summary: `Template ${template.name} archived.`,
    now,
  });
}

export function addSection(db: Database, session: Session, templateId: string, title: string, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const template = requireTemplate(db, scope.org.id, templateId);
  const trimmed = title.trim();
  if (trimmed.length < 2) throw new AppError("validation", "Section name is required.");
  const sortOrder = db.sections.filter((section) => section.templateId === template.id).length;
  const section: QuestionnaireSection = {
    id: createId(),
    organizationId: scope.org.id,
    templateId: template.id,
    title: trimmed,
    sortOrder,
  };
  db.sections.push(section);
  template.updatedAt = now;
  return section;
}

export function addQuestion(db: Database, session: Session, templateId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const template = requireTemplate(db, scope.org.id, templateId);
  const parsed = parseInput(questionSchema, input);
  const section = db.sections.find((item) => item.id === parsed.sectionId && item.templateId === template.id);
  if (!section) throw new AppError("validation", "Choose a section.");
  assertOptions(parsed.type, parsed.options);
  const sortOrder = db.questions.filter((question) => question.sectionId === section.id && !question.archivedAt).length;
  const question: Question = {
    id: createId(),
    organizationId: scope.org.id,
    templateId: template.id,
    sectionId: section.id,
    prompt: parsed.prompt,
    helpText: parsed.helpText,
    type: parsed.type,
    options: parsed.type === "multiple_choice" ? parsed.options : [],
    riskWeight: parsed.riskWeight,
    evidenceRequired: parsed.evidenceRequired,
    guidance: parsed.guidance,
    controlRef: parsed.controlRef,
    mappings: [],
    sortOrder,
    archivedAt: null,
  };
  db.questions.push(question);
  template.updatedAt = now;
  audit(db, scope, {
    action: "questionnaire.question_added",
    entityType: "question",
    entityId: question.id,
    summary: "Question added to template.",
    now,
  });
  return question;
}

export function updateQuestion(db: Database, session: Session, questionId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const question = db.questions.find((item) => item.id === questionId && item.organizationId === scope.org.id && !item.archivedAt);
  if (!question) throw new AppError("not_found", "Question not found.");
  requireTemplate(db, scope.org.id, question.templateId);
  const parsed = parseInput(questionSchema, input);
  const section = db.sections.find((item) => item.id === parsed.sectionId && item.templateId === question.templateId);
  if (!section) throw new AppError("validation", "Choose a section.");
  assertOptions(parsed.type, parsed.options);
  question.sectionId = section.id;
  question.prompt = parsed.prompt;
  question.helpText = parsed.helpText;
  question.type = parsed.type;
  question.options = parsed.type === "multiple_choice" ? parsed.options : [];
  question.riskWeight = parsed.riskWeight;
  question.evidenceRequired = parsed.evidenceRequired;
  question.guidance = parsed.guidance;
  question.controlRef = parsed.controlRef;
  const template = db.templates.find((item) => item.id === question.templateId);
  if (template) template.updatedAt = now;
  audit(db, scope, {
    action: "questionnaire.question_updated",
    entityType: "question",
    entityId: question.id,
    summary: "Template question updated. In-progress assessments keep their original copy.",
    now,
  });
}

export function archiveQuestion(db: Database, session: Session, questionId: string, now: string) {
  const scope = assertCan(db, session, "questionnaires.write");
  const question = db.questions.find((item) => item.id === questionId && item.organizationId === scope.org.id && !item.archivedAt);
  if (!question) throw new AppError("not_found", "Question not found.");
  question.archivedAt = now;
  audit(db, scope, {
    action: "questionnaire.question_archived",
    entityType: "question",
    entityId: question.id,
    summary: "Question archived.",
    now,
  });
}

export function requireTemplate(db: Database, organizationId: string, templateId: string): QuestionnaireTemplate {
  const template = db.templates.find((item) => item.id === templateId && item.organizationId === organizationId && !item.archivedAt);
  if (!template) throw new AppError("not_found", "Questionnaire not found.");
  return template;
}

function assertOptions(type: Question["type"], options: string[]) {
  if (type === "multiple_choice" && options.length < 2) {
    throw new AppError("validation", "Multiple choice questions need at least two options.");
  }
}
