import type { Surreal } from "surrealdb";

/**
 * Database schema, applied idempotently at startup (`OVERWRITE` keeps definitions in sync with code).
 * Data model: docs/SPEC.md section 5. Tables must be defined before LIVE SELECT can subscribe.
 */
export const SCHEMA = /* surql */ `
DEFINE TABLE OVERWRITE user SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON user TYPE string;
DEFINE FIELD OVERWRITE role ON user TYPE string ASSERT $value IN ["owner"];
DEFINE FIELD OVERWRITE created_at ON user TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE chat SCHEMAFULL;
DEFINE FIELD OVERWRITE kind ON chat TYPE string ASSERT $value IN ["direct", "group", "system"];
DEFINE FIELD OVERWRITE title ON chat TYPE string;
DEFINE FIELD OVERWRITE project ON chat TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON chat TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE last_message_at ON chat TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_message_preview ON chat TYPE option<string>;

DEFINE TABLE OVERWRITE member SCHEMAFULL;
DEFINE FIELD OVERWRITE chat ON member TYPE record<chat>;
DEFINE FIELD OVERWRITE participant ON member TYPE object;
DEFINE FIELD OVERWRITE participant.kind ON member TYPE string ASSERT $value IN ["user", "agent", "bot"];
DEFINE FIELD OVERWRITE participant.id ON member TYPE string;
DEFINE FIELD OVERWRITE role ON member TYPE string ASSERT $value IN ["owner", "member"];
DEFINE FIELD OVERWRITE joined_at ON member TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE member_unique ON member FIELDS chat, participant.kind, participant.id UNIQUE;

DEFINE TABLE OVERWRITE message SCHEMAFULL;
DEFINE FIELD OVERWRITE chat ON message TYPE record<chat>;
DEFINE FIELD OVERWRITE author ON message TYPE object;
DEFINE FIELD OVERWRITE author.kind ON message TYPE string ASSERT $value IN ["user", "agent", "bot"];
DEFINE FIELD OVERWRITE author.id ON message TYPE string;
DEFINE FIELD OVERWRITE kind ON message TYPE string ASSERT $value IN ["text", "card", "system"];
DEFINE FIELD OVERWRITE body ON message TYPE string;
DEFINE FIELD OVERWRITE card ON message TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE reply_to ON message TYPE option<record<message>>;
DEFINE FIELD OVERWRITE mentions ON message TYPE array<string> DEFAULT [];
DEFINE FIELD OVERWRITE status ON message TYPE string ASSERT $value IN ["streaming", "final", "error"];
DEFINE FIELD OVERWRITE chain_depth ON message TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE run ON message TYPE option<string>;
DEFINE FIELD OVERWRITE usage ON message TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE error ON message TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON message TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at ON message TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE message_chat ON message FIELDS chat;
`;

export async function applySchema(surreal: Surreal): Promise<void> {
  await surreal.query(SCHEMA).collect();
}
