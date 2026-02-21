export type AnchorType = "evidence_link" | "decision_link";

export interface AnchorInput {
  readonly id: string;
  readonly hint: string;
  readonly targetRef: string;
  readonly type: AnchorType;
}

export interface AnchorPort {
  insertAnchor(input: AnchorInput): Promise<void> | void;
}
