import { ReactElement } from "react";
import {
  StageBase,
  StageResponse,
  InitialData,
  Message,
} from "@chub-ai/stages-ts";
import { LoadResponse } from "@chub-ai/stages-ts/dist/types/load";

/* =========================================================
   TYPES
   ========================================================= */

type SceneMode = "normal" | "combat" | "chase" | "ritual";

type RollResult = {
  actor: string;
  die: number;
  attributeName: string;
  attribute: number;
  skillName: string;
  skill: number;
  situational: number;
  total: number;
  pt: number;
  result: string;
};

type MarkResult = {
  die: number;
  trigger: string;
  outcome: string;
  detail: string;
};

type MessageStateType = {
  valerie: {
    mana: number;
    maxMana: number;
    condition: string;
    restraint: string;
  };

  kieran: {
    heartCondition: string;
    condition: string;
  };

  scene: {
    mode: SceneMode;
    activeEnemies: number;
    light: string;
  };

  rollQueue: number[];
  markQueue: number[];

  lastRoll: RollResult | null;
  lastMark: MarkResult | null;
};

type ConfigType = Record<string, never>;
type InitStateType = Record<string, never>;
type ChatStateType = Record<string, never>;

/* =========================================================
   CHARACTER STATS
   ========================================================= */

const VALERIE_ATTRIBUTES: Record<string, number> = {
  "siła": -2,
  "zręczność": 1,
  "wytrzymałość": -1,
  "spostrzegawczość": 1,
  "percepcja": 1,
  "wiedza": 1,
  "wola": 2,
};

const VALERIE_SKILLS: Record<string, number> = {
  "magia krwi i zmysłów": 2,
  "rytuały": 2,
  "spostrzegawczość": 1,
  "blef / manipulacja": 1,
  "medycyna polowa / anatomia": 1,
  "nóż": 1,
  "dyplomacja / etykieta": -1,
  "skradanie się": -1,
};

const KIERAN_ATTRIBUTES: Record<string, number> = {
  "siła": 1,
  "zręczność": 2,
  "wytrzymałość": 1,
  "spostrzegawczość": 2,
  "percepcja": 2,
  "wiedza": 0,
  "wola": 1,
};

const KIERAN_SKILLS: Record<string, number> = {
  "magia varkha": 2,
  "polowanie / tropienie": 2,
  "jeździectwo": 2,
  "spostrzegawczość": 2,
  "broń": 1,
  "skradanie się": 1,
  "blef / urok": 2,
  "wiedza o kruczym dworze / etykieta": 1,
};

/* =========================================================
   VALERIE SPELL COSTS
   ========================================================= */

const SPELL_COSTS: Record<string, number> = {
  "krwawy sztych": 1,
  "rozdarcie mięsa": 1,
  "oślepienie smakiem": 2,
  "cierń w płucu": 2,
  "głód ciała": 2,
  "rozdarcie nerwu": 1,
  "odruch ostrza": 2,
  "krwawy trop": 1,
  "zwrot bólu": 2,
  "rozprucie zmysłów": 3,
  "cisza serca": 3,
  "głód ciemności": 3,
};

/* =========================================================
   RANDOM DICE
   ========================================================= */

function randomDie(sides: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return (values[0] % sides) + 1;
}

function createRollQueue(): number[] {
  return Array.from({ length: 8 }, () => randomDie(20));
}

function createMarkQueue(): number[] {
  return Array.from({ length: 6 }, () => randomDie(10));
}

/* =========================================================
   DEFAULT STATE
   ========================================================= */

function createDefaultState(): MessageStateType {
  return {
    valerie: {
      mana: 8,
      maxMana: 8,
      condition: "sprawna",
      restraint: "brak",
    },

    kieran: {
      heartCondition: "serce zatrzymane",
      condition: "zdolny do działania",
    },

    scene: {
      mode: "normal",
      activeEnemies: 0,
      light: "późne popołudnie",
    },

    rollQueue: createRollQueue(),
    markQueue: createMarkQueue(),

    lastRoll: null,
    lastMark: null,
  };
}

function normalizeState(
  incoming: Partial<MessageStateType> | null | undefined
): MessageStateType {
  const defaults = createDefaultState();

  if (!incoming || typeof incoming !== "object") {
    return defaults;
  }

  return {
    valerie: {
      ...defaults.valerie,
      ...(incoming.valerie ?? {}),
    },

    kieran: {
      ...defaults.kieran,
      ...(incoming.kieran ?? {}),
    },

    scene: {
      ...defaults.scene,
      ...(incoming.scene ?? {}),
    },

    rollQueue: Array.isArray(incoming.rollQueue)
      ? incoming.rollQueue
      : defaults.rollQueue,

    markQueue: Array.isArray(incoming.markQueue)
      ? incoming.markQueue
      : defaults.markQueue,

    lastRoll: incoming.lastRoll ?? null,
    lastMark: incoming.lastMark ?? null,
  };
}

/* =========================================================
   HELPERS
   ========================================================= */

function key(value: string): string {
  return value.trim().toLocaleLowerCase("pl-PL");
}

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "+0";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function determineRollResult(
  die: number,
  total: number,
  pt: number
): string {
  if (die === 20) return "NATURALNE 20";
  if (die === 1) return "NATURALNA 1";

  return total >= pt ? "SUKCES" : "PORAŻKA";
}

function determineMarkResult(
  die: number,
  trigger: string
): MarkResult {
  if (die <= 4) {
    return {
      die,
      trigger,
      outcome: "BRAK PRZEBICIA",
      detail: "Znamię reaguje, ale nie przebija się przez kontrolę Valerie.",
    };
  }

  if (die <= 6) {
    return {
      die,
      trigger,
      outcome: "PODSZEPT",
      detail:
        "Silny impuls ku bardziej brutalnemu rozwiązaniu. MG nie wybiera dobrowolnej reakcji Valerie.",
    };
  }

  if (die <= 8) {
    return {
      die,
      trigger,
      outcome: "WYPACZENIE",
      detail:
        "Magia działa odwrotnie, ostrzej albo okrutniej, niż Valerie zamierzała.",
    };
  }

  return {
    die,
    trigger,
    outcome: "UTRATA AKCJI",
    detail:
      "W ciężkiej sytuacji MG przejmuje dokładnie jedną natychmiastową akcję Valerie. Potem pełna sprawczość wraca do gracza.",
  };
}

function getKnownStat(
  actor: string,
  statType: "attribute" | "skill",
  name: string
): number | null {
  const normalizedActor = key(actor);
  const normalizedName = key(name);

  if (
    normalizedName === "brak" ||
    normalizedName === "none" ||
    normalizedName === "-"
  ) {
    return 0;
  }

  if (normalizedActor === "valerie") {
    const source =
      statType === "attribute"
        ? VALERIE_ATTRIBUTES
        : VALERIE_SKILLS;

    return source[normalizedName] ?? null;
  }

  if (normalizedActor === "kieran") {
    const source =
      statType === "attribute"
        ? KIERAN_ATTRIBUTES
        : KIERAN_SKILLS;

    return source[normalizedName] ?? null;
  }

  return null;
}

function getSpellCost(name: string): number | null {
  return SPELL_COSTS[key(name)] ?? null;
}

function humanMarkTrigger(raw: string): string {
  const normalized = key(raw);

  if (normalized === "mana") return "mana 0";
  if (normalized === "emotion") return "silne emocje";
  if (normalized === "ritual") return "przerwany rytuał";

  return raw;
}

/* =========================================================
   STAGE
   ========================================================= */

export class Stage extends StageBase<
  InitStateType,
  ChatStateType,
  MessageStateType,
  ConfigType
> {
  gameState: MessageStateType;

  constructor(
    data: InitialData<
      InitStateType,
      ChatStateType,
      MessageStateType,
      ConfigType
    >
  ) {
    super(data);
    this.gameState = normalizeState(data.messageState);
  }

  async load(): Promise<
    Partial<
      LoadResponse<
        InitStateType,
        ChatStateType,
        MessageStateType
      >
    >
  > {
    return {
      success: true,
      error: null,
      initState: null,
      chatState: null,
    };
  }

  async setState(state: MessageStateType): Promise<void> {
    this.gameState = normalizeState(state);
  }

  /* =======================================================
     BEFORE PROMPT
     ======================================================= */

  async beforePrompt(
    _userMessage: Message
  ): Promise<
    Partial<
      StageResponse<
        ChatStateType,
        MessageStateType
      >
    >
  > {
    const rollQueue = createRollQueue();
    const markQueue = createMarkQueue();

    this.gameState = {
      ...this.gameState,
      rollQueue,
      markQueue,
    };

    const directions = `
RUYEN — MECHANICAL ENGINE

CURRENT STATE

Valerie:
Mana ${this.gameState.valerie.mana}/${this.gameState.valerie.maxMana}
Condition: ${this.gameState.valerie.condition}
Restraint: ${this.gameState.valerie.restraint}

Kieran:
Heart: ${this.gameState.kieran.heartCondition}
Condition: ${this.gameState.kieran.condition}

Scene:
Mode: ${this.gameState.scene.mode}
Active enemies: ${this.gameState.scene.activeEnemies}
Light: ${this.gameState.scene.light}

PRIVATE D20 QUEUE:
${rollQueue.join(", ")}

PRIVATE MARK K10 QUEUE:
${markQueue.join(", ")}

Never expose unused future dice.

==================================================
D20 RULES
==================================================

Use d20 results strictly from LEFT TO RIGHT.

Never choose, skip, reorder, reroll or invent a result.

Roll only when:
- the outcome is genuinely uncertain;
- there is meaningful risk or consequence;
- the result materially changes the situation.

Formula:

d20
+ maximum ONE relevant Attribute
+ maximum ONE relevant Skill
+ situational modifier
vs PT.

Situational modifier is normally -2 to +2.

PT 12 = ordinary meaningful risk.
PT 15 = difficult; requires a concrete hindrance.
PT 19 = extreme.

Natural 20 = strong favourable turn.
Natural 1 = meaningful unfortunate turn, never arbitrary catastrophe.

For Valerie or Kieran:

[[RUYEN_ROLL|ACTOR|ATTRIBUTE|SKILL|SITUATIONAL|PT]]

Example:

[[RUYEN_ROLL|VALERIE|Wola|Blef / manipulacja|0|15]]

For another NPC:

[[RUYEN_ROLL_NPC|NAME|ATTRIBUTE_NAME|ATTRIBUTE_VALUE|SKILL_NAME|SKILL_VALUE|SITUATIONAL|PT]]

Example:

[[RUYEN_ROLL_NPC|Łowczy Kruczego Dworu|Zręczność|1|Walka|1|0|12]]

One contested action uses ONE roll.

Do not roll an attack and then a separate defence against the exact same action.

If a grab succeeds, the target is grabbed.
A later attempt to escape is a new action.

==================================================
VALERIE — MANA
==================================================

Valerie may cast magic at 0 Mana.

0 Mana does NOT disable magic.

Every attempted established spell spends Mana immediately, whether the spell succeeds or fails.

For every attempted spell append:

[[RUYEN_CAST|EXACT SPELL NAME]]

Mana cannot fall below 0.

If the spell leaves Valerie at 0 Mana, the Mark triggers automatically.

If Valerie begins at 0 Mana and casts, the Mark triggers again.

Blood Draw:

[[RUYEN_BLOOD_DRAW|1]]

or for a severely injured target:

[[RUYEN_BLOOD_DRAW|2]]

Maximum Mana is 8.

==================================================
THE MARK
==================================================

The Mark triggers ONLY when:

1. Mana reaches 0 or Valerie casts while already at 0.
This is handled automatically by RUYEN_CAST.

2. A ritual is interrupted:
[[RUYEN_MARK_TRIGGER|ritual]]

3. Valerie casts magic during:
anger,
panic,
despair,
humiliation.

Use:
[[RUYEN_MARK_TRIGGER|emotion]]

Do not trigger emotion separately if the same magical act already triggered the Mark through Mana 0.

Use Mark k10 results from LEFT TO RIGHT.

1-4 = no breakthrough.
5-6 = whisper.
7-8 = spell distortion.
9-10 = loss of exactly one action, only in a severe situation.

Use the Mark effect in the same scene.

==================================================
STATE
==================================================

When persistent state changes, append:

[[RUYEN_VAL_CONDITION|description]]
[[RUYEN_VAL_RESTRAINT|description]]

[[RUYEN_KIERAN_CONDITION|description]]
[[RUYEN_KIERAN_HEART|description]]

[[RUYEN_SCENE_MODE|normal]]
[[RUYEN_SCENE_MODE|combat]]
[[RUYEN_SCENE_MODE|chase]]
[[RUYEN_SCENE_MODE|ritual]]

[[RUYEN_ENEMIES|number]]

[[RUYEN_LIGHT|description]]

Restraints must be concrete.

Good:
[[RUYEN_VAL_RESTRAINT|lewy nadgarstek trzymany przez łowczego]]

Bad:
[[RUYEN_VAL_RESTRAINT|unieruchomiona]]

All RUYEN markers are technical metadata and will be removed before the player sees the response.
`;

    return {
      stageDirections: directions,
      messageState: this.gameState,
      modifiedMessage: null,
      systemMessage: null,
      error: null,
      chatState: null,
    };
  }

  /* =======================================================
     AFTER RESPONSE
     ======================================================= */

  async afterResponse(
    botMessage: Message
  ): Promise<
    Partial<
      StageResponse<
        ChatStateType,
        MessageStateType
      >
    >
  > {
    const content = botMessage.content ?? "";

    const markerRegex =
      /\[\[(RUYEN_[A-Z_]+)\|([^\]]*)\]\]/g;

    const markers = [...content.matchAll(markerRegex)];

    let rollCursor = 0;
    let markCursor = 0;

    let lastRoll = this.gameState.lastRoll;
    let lastMark = this.gameState.lastMark;

    const rollReports: string[] = [];
    const warnings: string[] = [];

    let newState: MessageStateType = {
      ...this.gameState,

      valerie: {
        ...this.gameState.valerie,
      },

      kieran: {
        ...this.gameState.kieran,
      },

      scene: {
        ...this.gameState.scene,
      },
    };

    const triggerMark = (rawTrigger: string): void => {
      const die = newState.markQueue[markCursor];

      if (die === undefined) {
        warnings.push("Brak dostępnego k10 dla Znamię.");
        return;
      }

      markCursor += 1;

      lastMark = determineMarkResult(
        die,
        humanMarkTrigger(rawTrigger)
      );
    };

    for (const marker of markers) {
      const markerType = marker[1];

      const payload = marker[2]
        .split("|")
        .map((part) => part.trim());

      /* =========================
         VALERIE / KIERAN ROLL
         ========================= */

      if (markerType === "RUYEN_ROLL") {
        if (payload.length !== 5) {
          warnings.push("Błędny marker RUYEN_ROLL.");
          continue;
        }

        const [
          actor,
          attributeName,
          skillName,
          situationalRaw,
          ptRaw,
        ] = payload;

        const die = newState.rollQueue[rollCursor];

        if (die === undefined) {
          warnings.push("Brak dostępnego k20.");
          continue;
        }

        rollCursor += 1;

        const attribute = getKnownStat(
          actor,
          "attribute",
          attributeName
        );

        const skill = getKnownStat(
          actor,
          "skill",
          skillName
        );

        if (attribute === null) {
          warnings.push(
            `Nieznany atrybut ${actor}: ${attributeName}`
          );
          continue;
        }

        if (skill === null) {
          warnings.push(
            `Nieznana umiejętność ${actor}: ${skillName}`
          );
          continue;
        }

        const situational = Number(situationalRaw);
        const pt = Number(ptRaw);

        if (
          Number.isNaN(situational) ||
          Number.isNaN(pt)
        ) {
          warnings.push("Błędne liczby w rzucie.");
          continue;
        }

        const total =
          die +
          attribute +
          skill +
          situational;

        const result =
          determineRollResult(die, total, pt);

        lastRoll = {
          actor,
          die,
          attributeName,
          attribute,
          skillName,
          skill,
          situational,
          total,
          pt,
          result,
        };

        rollReports.push(
          `${actor}: k20 ${die} ` +
          `${signed(attribute)} ${attributeName} ` +
          `${signed(skill)} ${skillName} ` +
          `${signed(situational)} sytuacja ` +
          `= ${total} vs PT ${pt} → ${result}`
        );

        continue;
      }

      /* =========================
         GENERIC NPC ROLL
         ========================= */

      if (markerType === "RUYEN_ROLL_NPC") {
        if (payload.length !== 7) {
          warnings.push("Błędny marker RUYEN_ROLL_NPC.");
          continue;
        }

        const [
          actor,
          attributeName,
          attributeRaw,
          skillName,
          skillRaw,
          situationalRaw,
          ptRaw,
        ] = payload;

        const die = newState.rollQueue[rollCursor];

        if (die === undefined) {
          warnings.push("Brak dostępnego k20.");
          continue;
        }

        rollCursor += 1;

        const attribute = Number(attributeRaw);
        const skill = Number(skillRaw);
        const situational = Number(situationalRaw);
        const pt = Number(ptRaw);

        if (
          Number.isNaN(attribute) ||
          Number.isNaN(skill) ||
          Number.isNaN(situational) ||
          Number.isNaN(pt)
        ) {
          warnings.push(`Błędne statystyki NPC: ${actor}`);
          continue;
        }

        const total =
          die +
          attribute +
          skill +
          situational;

        const result =
          determineRollResult(die, total, pt);

        lastRoll = {
          actor,
          die,
          attributeName,
          attribute,
          skillName,
          skill,
          situational,
          total,
          pt,
          result,
        };

        rollReports.push(
          `${actor}: k20 ${die} ` +
          `${signed(attribute)} ${attributeName} ` +
          `${signed(skill)} ${skillName} ` +
          `${signed(situational)} sytuacja ` +
          `= ${total} vs PT ${pt} → ${result}`
        );

        continue;
      }

      /* =========================
         SPELL / MANA
         ========================= */

      if (markerType === "RUYEN_CAST") {
        const spellName = payload.join("|");
        const cost = getSpellCost(spellName);

        if (cost === null) {
          warnings.push(
            `Nieznane zaklęcie Valerie: ${spellName}`
          );
          continue;
        }

        newState.valerie.mana = clamp(
          newState.valerie.mana - cost,
          0,
          newState.valerie.maxMana
        );

        /*
          Mana 0 does not stop casting.
          Reaching 0 OR casting while at 0
          triggers the Mark.
        */
        if (newState.valerie.mana === 0) {
          triggerMark("mana");
        }

        continue;
      }

      /* =========================
         BLOOD DRAW
         ========================= */

      if (markerType === "RUYEN_BLOOD_DRAW") {
        const amount = Number(payload[0]);

        if (amount !== 1 && amount !== 2) {
          warnings.push(
            "Pobranie Krwi może zwrócić tylko 1 albo 2 many."
          );
          continue;
        }

        newState.valerie.mana = clamp(
          newState.valerie.mana + amount,
          0,
          newState.valerie.maxMana
        );

        continue;
      }

      /* =========================
         OTHER MARK TRIGGERS
         ========================= */

      if (markerType === "RUYEN_MARK_TRIGGER") {
        const trigger = payload[0] ?? "";

        if (
          key(trigger) !== "emotion" &&
          key(trigger) !== "ritual"
        ) {
          warnings.push(
            `Nieznany trigger Znamię: ${trigger}`
          );
          continue;
        }

        triggerMark(trigger);
        continue;
      }

      /* =========================
         STATE
         ========================= */

      if (markerType === "RUYEN_VAL_CONDITION") {
        newState.valerie.condition = payload.join("|");
        continue;
      }

      if (markerType === "RUYEN_VAL_RESTRAINT") {
        newState.valerie.restraint = payload.join("|");
        continue;
      }

      if (markerType === "RUYEN_KIERAN_CONDITION") {
        newState.kieran.condition = payload.join("|");
        continue;
      }

      if (markerType === "RUYEN_KIERAN_HEART") {
        newState.kieran.heartCondition = payload.join("|");
        continue;
      }

      if (markerType === "RUYEN_SCENE_MODE") {
        const mode = payload[0] as SceneMode;

        if (
          mode === "normal" ||
          mode === "combat" ||
          mode === "chase" ||
          mode === "ritual"
        ) {
          newState.scene.mode = mode;
        }

        continue;
      }

      if (markerType === "RUYEN_ENEMIES") {
        const enemies = Number(payload[0]);

        if (
          Number.isInteger(enemies) &&
          enemies >= 0
        ) {
          newState.scene.activeEnemies = enemies;
        }

        continue;
      }

      if (markerType === "RUYEN_LIGHT") {
        newState.scene.light = payload.join("|");
        continue;
      }
    }

    newState.lastRoll = lastRoll;
    newState.lastMark = lastMark;

    this.gameState = newState;

    /* =========================
       REMOVE TECHNICAL MARKERS
       ========================= */

    const cleanedContent = content
      .replace(markerRegex, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const systemMessage =
      rollReports.length > 0
        ? "RUYEN — DOWÓD RZUTU\n" +
          rollReports.join("\n")
        : null;

    return {
      stageDirections: null,

      messageState: this.gameState,

      modifiedMessage:
        cleanedContent !== content
          ? cleanedContent
          : null,

      systemMessage,

      error:
        warnings.length > 0
          ? warnings.join(" | ")
          : null,

      chatState: null,
    };
  }

  /* =========================================================
     COMPACT UI
     ========================================================= */

  render(): ReactElement {
    const state = this.gameState;
    const roll = state.lastRoll;
    const mark = state.lastMark;

    const panel = {
      width: "100%",
      maxWidth: "520px",
      maxHeight: "95vh",
      overflowY: "auto" as const,
      overflowX: "hidden" as const,
      boxSizing: "border-box" as const,
      padding: "8px 12px",
      background: "#181515",
      color: "#eee7e2",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      lineHeight: 1.3,
    };

    const section = {
      padding: "6px 0",
      borderTop: "1px solid #403837",
    };

    const row = {
      display: "flex",
      justifyContent: "space-between",
      gap: "14px",
      padding: "1px 0",
    };

    const heading = {
      fontWeight: 700,
      color: "#d8aa88",
      marginBottom: "3px",
      fontSize: "12px",
      letterSpacing: "0.5px",
    };

    const muted = {
      opacity: 0.72,
    };

    return (
      <div style={panel}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "15px",
            color: "#d8aa88",
            marginBottom: "5px",
            letterSpacing: "2px",
          }}
        >
          RUYEN
        </div>

        {/* VALERIE */}

        <div style={section}>
          <div style={heading}>VALERIE</div>

          <div style={row}>
            <span style={muted}>Mana</span>
            <strong>
              {state.valerie.mana}/{state.valerie.maxMana}
            </strong>
          </div>

          <div style={row}>
            <span style={muted}>Stan</span>
            <span>{state.valerie.condition}</span>
          </div>

          {state.valerie.restraint !== "brak" && (
            <div style={row}>
              <span style={muted}>Skrępowanie</span>
              <span>{state.valerie.restraint}</span>
            </div>
          )}
        </div>

        {/* KIERAN */}

        <div style={section}>
          <div style={heading}>KIERAN</div>

          <div style={row}>
            <span style={muted}>Serce</span>
            <span>{state.kieran.heartCondition}</span>
          </div>

          <div style={row}>
            <span style={muted}>Stan</span>
            <span>{state.kieran.condition}</span>
          </div>
        </div>

        {/* SCENE */}

        <div style={section}>
          <div style={heading}>SCENA</div>

          <div style={row}>
            <span>
              {state.scene.mode} · {state.scene.light}
            </span>

            <span>
              wrogowie: <strong>{state.scene.activeEnemies}</strong>
            </span>
          </div>
        </div>

        {/* MARK — visible only if triggered */}

        {mark && (
          <div style={section}>
            <div style={heading}>ZNAMIĘ</div>

            <div style={row}>
              <span>
                {mark.trigger} · k10 {mark.die}
              </span>

              <strong>{mark.outcome}</strong>
            </div>

            <div
              style={{
                marginTop: "2px",
                fontSize: "11px",
                opacity: 0.65,
              }}
            >
              {mark.detail}
            </div>
          </div>
        )}

        {/* LAST ROLL — visible only if rolled */}

        {roll && (
          <div style={section}>
            <div style={heading}>OSTATNI RZUT</div>

            <div>
              <strong>{roll.actor}</strong>: k20 {roll.die}
              {" "}
              {signed(roll.attribute)} {roll.attributeName}
              {" "}
              {signed(roll.skill)} {roll.skillName}

              {roll.situational !== 0 && (
                <>
                  {" "}
                  {signed(roll.situational)} sytuacja
                </>
              )}
            </div>

            <div
              style={{
                marginTop: "2px",
                fontWeight: 700,
              }}
            >
              {roll.total} vs PT {roll.pt} → {roll.result}
            </div>
          </div>
        )}
      </div>
    );
  }
}