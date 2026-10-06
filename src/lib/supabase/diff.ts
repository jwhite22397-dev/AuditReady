import type { Database } from "@/lib/domain/types";
import { TABLE_BINDINGS } from "./rows";

export interface TableChange {
  table: string;
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}

export function collectChanges(before: Database, after: Database, organizationId?: string): TableChange[] {
  const changes: TableChange[] = [];
  for (const binding of TABLE_BINDINGS) {
    const previous = new Map(before[binding.key].map((row) => [row.id, JSON.stringify(binding.toRow(row))]));
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    for (const row of after[binding.key]) {
      const encoded = binding.toRow(row);
      if (organizationId) {
        if (binding.table === "profiles") continue;
        if (encoded.organization_id !== organizationId) continue;
      }
      const prior = previous.get(row.id);
      if (prior === JSON.stringify(encoded)) continue;
      if (prior === undefined) inserts.push(encoded);
      else if (binding.table !== "audit_events") updates.push(encoded);
    }
    if (inserts.length > 0 || updates.length > 0) changes.push({ table: binding.table, inserts, updates });
  }
  return changes;
}

export interface RowWriter {
  insert(table: string, rows: Record<string, unknown>[]): Promise<void>;
  update(table: string, row: Record<string, unknown>): Promise<void>;
}

export async function flushChanges(writer: RowWriter, before: Database, after: Database, organizationId?: string): Promise<void> {
  const changes = collectChanges(before, after, organizationId);
  for (const change of changes) {
    for (let index = 0; index < change.inserts.length; index += 100) {
      await writer.insert(change.table, change.inserts.slice(index, index + 100));
    }
    for (const row of change.updates) await writer.update(change.table, row);
  }
}
