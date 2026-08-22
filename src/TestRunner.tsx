import {Stage} from "./Stage";
import {useEffect, useState} from "react";
import {DEFAULT_INITIAL, StageBase, InitialData} from "@chub-ai/stages-ts";

// Modify this JSON to include whatever character/user information you want to test.
import InitData from './assets/test-init.json';

export interface TestStageRunnerProps<StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>, InitStateType, ChatStateType, MessageStateType, ConfigType> {
    factory: (data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) => StageType;
}

/***
 This is a testing class for running a stage locally when testing,
    outside the context of an active chat. See runTests() below for the main idea.
 ***/
export const TestStageRunner = <StageType extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType>,
    InitStateType, ChatStateType, MessageStateType, ConfigType>({ factory }: TestStageRunnerProps<StageType, InitStateType, ChatStateType, MessageStateType, ConfigType>) => {

    // You may need to add a @ts-ignore here,
    //     as the linter doesn't always like the idea of reading types arbitrarily from files
    // @ts-ignore
    const [stage, _setStage] = useState(new Stage({...DEFAULT_INITIAL, ...InitData}));

    // This is what forces the stage node to re-render.
    const [node, setNode] = useState(new Date());

    function refresh() {
        setNode(new Date());
    }

    async function delayedTest(test: any, delaySeconds: number) {
        await new Promise(f => setTimeout(f, delaySeconds * 1000));
        return test();
    }

    /***
     This is the main thing you'll want to modify.
     ***/
    async function runTests() {
       console.log("=== RUYEN TEST: CISZA SERCA PRZY 2/8 MANY ===");

  // Ustawiamy Val specjalnie na 2/8,
  // żeby czar za 3 zszedł do 0 i uruchomił Znamię.
  await stage.setState({
    valerie: {
      mana: 2,
      maxMana: 8,
      condition: "sprawna",
      restraint: "brak",
    },

    kieran: {
      heartCondition: "serce zatrzymane",
      condition: "zdolny do działania",
    },

    scene: {
      mode: "combat",
      activeEnemies: 1,
      light: "późne popołudnie",
    },

    rollQueue: [],
    markQueue: [],

    lastRoll: null,
    lastMark: null,
  });

  refresh();

  // Symulujemy wysłanie wiadomości gracza.
  // Stage generuje tutaj prywatne k20 i k10.
  const before = await stage.beforePrompt({
    anonymizedId: "test-user",
    content: "Valerie próbuje rzucić Ciszę Serca.",
    isBot: false,
    promptForId: null,
  } as any);

  console.log("BEFORE PROMPT:", before);

  // Symulujemy odpowiedź MG.
  // Mana ma zostać pobrana niezależnie od wyniku rzutu.
  const after = await stage.afterResponse({
    anonymizedId: "test-gm",
    isBot: true,
    promptForId: null,
    content: `
Valerie sięga magią w serce przeciwnika.

[[RUYEN_CAST|Cisza Serca]]
[[RUYEN_ROLL|VALERIE|Wola|Magia krwi i zmysłów|0|12]]
`,
  } as any);

  console.log("AFTER RESPONSE:", after);

  refresh();
    }

    useEffect(() => {
        // Always do this first, and put any other calls inside the load response.
        stage.load().then((res) => {
            console.info(`Test StageBase Runner load success result was ${res.success}`);
            if(!res.success || res.error != null) {
                console.error(`Error from stage during load, error: ${res.error}`);
            } else {
                runTests().then(() => console.info("Done running tests."));
            }
        });
    }, []);

    return <>
        <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
        {stage == null ? <div>Stage loading...</div> : stage.render()}
    </>;
}
