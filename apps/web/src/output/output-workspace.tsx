import {
  gamePlanSubtitle,
  revisionRows,
  unitName,
  type Concept,
  type Formation,
  type GamePlan,
  type GamePlanRevision,
  type PlayDocument,
} from "@chalk/domain";
import {
  acceptSource,
  defaultCallSheetConfig,
  detailPresets,
  outputFormat,
  outputFormats,
  outputGroups,
  paperLabel,
  positionGroupCatalog,
  preparedStamp,
  previewCss,
  withPreviewCss,
  bookEntriesOf,
  defaultBookConfigs,
  defaultWristbandConfig,
  reconcileCallSheetConfig,
  reconcileWristbandConfig,
  type BookConfigs,
  type CallSheetConfig,
  type OutputPaper,
  type PageMap,
  type WristbandConfig,
  type OutputPreset,
  type OutputSourceKind,
} from "@chalk/exports";
import {
  buildRenderScene,
  buildSvgRenderScene,
  pageKindCatalog,
  typePresetCatalog,
  type Presentation,
} from "@chalk/render";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LibrarySnapshot } from "../app/editor-runtime";
import {
  downloadBlob,
  downloadText,
  pngFromSvg,
} from "../components/export-files";
import { FieldDiagram } from "../components/field-diagram";
import { CallSheetOptions } from "./call-sheet-options";
import { BookOptions } from "./book-options";
import { measureBookPages, samePageMap } from "./paginate";
import { WristbandOptions } from "./wristband-options";
import {
  buildOutputDocument,
  framesManifest,
  type OutputDocument,
  type OutputOptions,
  type ResolvedSource,
} from "./output-documents";
import {
  type OutputPorts,
  type OutputSpec,
  type SourceChoice,
} from "./output-spec";
import {
  estimatePages,
  printInFrame,
  printInWindow,
  type PageEstimate,
  type PrintOutcome,
} from "./print-frame";

const sourceNames: Record<OutputSourceKind, string> = {
  current: "Current play",
  selection: "Selected plays",
  plan: "Game plan",
  book: "Full playbook",
};

/**
 * Print & export (issue #69): choose the source, choose the format, see the
 * sheet as it will print, then print or save. The source is stated before
 * anything is built; a format that cannot take it says why and leaves the
 * selection alone; the preview shows the paper, its margins and its page
 * breaks; and a blocked pop-up is reported with the way round it.
 */
export function OutputWorkspace({
  currentPlay,
  formations,
  initial,
  onClose,
  onRan,
  ports,
  presentation,
  snapshot,
}: {
  currentPlay: PlayDocument;
  formations: readonly Formation[];
  initial: OutputSpec;
  onClose: () => void;
  /** An output went out; the shell keeps it under Recent. */
  onRan: (preset: Omit<OutputPreset, "id" | "atMs">) => void;
  ports: OutputPorts;
  presentation: Presentation;
  snapshot: LibrarySnapshot;
}) {
  const [spec, setSpec] = useState<OutputSpec>(initial);
  const [libraryPlays, setLibraryPlays] = useState<{
    readonly plays: readonly PlayDocument[];
    readonly concepts: readonly Concept[];
  }>();
  const [plans, setPlans] = useState<readonly GamePlan[]>([]);
  const [sheetConfigs, setSheetConfigs] = useState<
    Readonly<Record<string, CallSheetConfig>>
  >({});
  const [bandConfigs, setBandConfigs] = useState<
    Readonly<Record<string, WristbandConfig>>
  >({});
  const [books, setBooks] = useState<BookConfigs>(defaultBookConfigs);
  /** The binder's page numbers, as the preview measured them. */
  const [pageMap, setPageMap] = useState<{
    readonly key: string;
    readonly map: PageMap;
  }>();
  /**
   * What was read for a plan, keyed to the plan and the revision it was read
   * for: another plan's packet is never taken for this one, and while a
   * plan's own reads are still in flight nothing prints.
   */
  const [loaded, setLoaded] = useState<{
    readonly planId: string;
    readonly revisionId: string | undefined;
    readonly revision: GamePlanRevision | undefined;
    readonly plays: readonly PlayDocument[];
  }>();
  const [outcome, setOutcome] = useState<
    PrintOutcome | { ok: "sent"; what: string }
  >();
  const frameRef = useRef<HTMLIFrameElement>(null);
  void presentation;

  useEffect(() => {
    let cancelled = false;
    void ports.loadLibrary().then((loaded) => {
      if (!cancelled) setLibraryPlays(loaded);
    });
    void ports.library.listGamePlans().then((list) => {
      if (!cancelled) setPlans(list);
    });
    void ports.library.loadCallSheetConfigs().then((configs) => {
      if (!cancelled) setSheetConfigs(configs);
    });
    void ports.library.loadWristbandConfigs().then((configs) => {
      if (!cancelled) setBandConfigs(configs);
    });
    void ports.library.loadBookConfigs().then((configs) => {
      if (!cancelled) setBooks(configs);
    });
    return () => {
      cancelled = true;
    };
  }, [ports]);

  const source = spec.source;
  const plan =
    source.kind === "plan"
      ? plans.find(({ id }) => id === source.planId)
      : undefined;
  const planId = plan?.id;
  const revisionId = plan?.preparedRevisionId;
  const planCalls = plan?.calls;
  useEffect(() => {
    if (!planId || !planCalls) return;
    let cancelled = false;
    void Promise.all([
      revisionId
        ? ports.library.getGamePlanRevision(revisionId)
        : Promise.resolve(undefined),
      Promise.all(planCalls.map((call) => ports.library.getPlay(call.playId))),
    ]).then(([found, stored]) => {
      if (cancelled) return;
      setLoaded({
        planId,
        revisionId,
        revision: found,
        plays: stored.flatMap((entry) => (entry ? [entry.document] : [])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [planCalls, planId, ports.library, revisionId]);
  // Only what was read for this plan, at its current prepared revision.
  const loadedHere =
    loaded &&
    plan &&
    loaded.planId === plan.id &&
    loaded.revisionId === plan.preparedRevisionId
      ? loaded
      : undefined;
  const revision = loadedHere?.revision;
  const planPlays = loadedHere?.plays;
  const planLoading =
    source.kind === "plan" && plan !== undefined && !loadedHere;

  const concepts = libraryPlays?.concepts ?? snapshot.concepts;
  const resolved = useMemo<ResolvedSource>(() => {
    switch (source.kind) {
      case "current":
        return {
          kind: "current",
          label: currentPlay.name,
          plays: [currentPlay],
          unit: unitName(currentPlay.unit),
          order: "the open play",
        };
      case "selection": {
        const byId = new Map(
          (libraryPlays?.plays ?? [currentPlay]).map((play) => [play.id, play]),
        );
        const plays = source.playIds.flatMap((id) => {
          const play = byId.get(id);
          return play ? [play] : [];
        });
        return {
          kind: "selection",
          label:
            plays.length === 1
              ? plays[0]!.name
              : `${plays.length} selected plays`,
          plays,
          order: "in the order picked",
        };
      }
      case "plan": {
        if (!plan) {
          return { kind: "plan", label: "Game plan", plays: [], order: "" };
        }
        if (planLoading) {
          return {
            kind: "plan",
            label: plan.name,
            plays: [],
            copy: "reading the plan…",
            unit: unitName(plan.unit),
            order: "",
          };
        }
        const usePacket = source.copy === "revision" && revision;
        const packet =
          usePacket && source.sectionId
            ? {
                ...revision,
                plan: {
                  ...revision.plan,
                  sections: revision.plan.sections.filter(
                    ({ id }) => id === source.sectionId,
                  ),
                  calls: revision.plan.calls.filter((call) =>
                    revision.plan.sections
                      .find(({ id }) => id === source.sectionId)
                      ?.callIds.includes(call.id),
                  ),
                },
              }
            : usePacket
              ? revision
              : undefined;
        const sectionName = source.sectionId
          ? (plan.sections.find(({ id }) => id === source.sectionId)?.name ??
            "")
          : "";
        const packetPlays = packet
          ? revisionRows(packet)
              .flatMap((section) => section.calls)
              .flatMap((row) => (row.play ? [row.play] : []))
          : [];
        const livePlays = (() => {
          const byId = new Map(
            (planPlays ?? []).map((play) => [play.id, play]),
          );
          const callIds = source.sectionId
            ? (plan.sections.find(({ id }) => id === source.sectionId)
                ?.callIds ?? [])
            : plan.calls.map(({ id }) => id);
          return callIds.flatMap((callId) => {
            const call = plan.calls.find(({ id }) => id === callId);
            const play = call ? byId.get(call.playId) : undefined;
            return play ? [play] : [];
          });
        })();
        return {
          kind: "plan",
          label: `${plan.name}${sectionName ? ` — ${sectionName}` : ""}`,
          plays: packet ? packetPlays : livePlays,
          ...(packet ? { revision: packet } : {}),
          copy: packet
            ? preparedStamp(packet).replace(/^P/, "p")
            : revision
              ? "current plays, not the prepared packet"
              : "current plays",
          unit: unitName(plan.unit),
          order: "in section order",
        };
      }
      case "book":
        return {
          kind: "book",
          label: "Full playbook",
          plays: libraryPlays?.plays ?? [],
          order: "in library order",
        };
    }
  }, [
    currentPlay,
    libraryPlays,
    plan,
    planLoading,
    planPlays,
    revision,
    source,
  ]);

  const format = outputFormat(spec.format);
  // A book's paper is the book's own choice; the catalogue's is the default.
  const paper = useMemo<OutputPaper | undefined>(
    () =>
      spec.format === "binder"
        ? { size: books.binder.paper, orientation: "portrait", marginIn: 0.5 }
        : spec.format === "handout"
          ? {
              size: books.handout.paper,
              orientation: books.handout.orientation,
              marginIn: 0.5,
            }
          : format.paper,
    [books.binder.paper, books.handout, format.paper, spec.format],
  );
  // The plan the sheet is laid out from: the prepared revision's own copy
  // when the packet prints, so a section deleted or renamed in the live
  // plan afterwards still prints as it was prepared; the live plan only for
  // its current plays.
  const sheetPlan =
    source.kind === "plan" && source.copy === "revision" && revision
      ? revision.plan
      : plan;
  // The plan's own sheet layout: stored on this device, brought up to date
  // with the plan it prints, or the template its unit points at.
  const sheetConfig = useMemo<CallSheetConfig | undefined>(() => {
    if (!plan || !sheetPlan) return undefined;
    const stored = sheetConfigs[plan.id];
    return stored
      ? reconcileCallSheetConfig(stored, sheetPlan)
      : defaultCallSheetConfig(sheetPlan);
  }, [plan, sheetConfigs, sheetPlan]);
  const setSheetConfig = (next: CallSheetConfig) => {
    if (!plan) return;
    setSheetConfigs((current) => ({ ...current, [plan.id]: next }));
    void ports.library
      .saveCallSheetConfig(plan.id, next)
      .catch(() => undefined);
  };
  // The plan's wristband: stored on this device and brought up to date with
  // the packet, or every call of the plan in plan order, to confirm.
  const packet = resolved.revision;
  const bandConfig = useMemo<WristbandConfig | undefined>(() => {
    if (!plan || !packet) return undefined;
    const stored = bandConfigs[plan.id];
    return stored
      ? reconcileWristbandConfig(stored, packet)
      : defaultWristbandConfig(packet);
  }, [bandConfigs, packet, plan]);
  const setBandConfig = (next: WristbandConfig) => {
    if (!plan) return;
    setBandConfigs((current) => ({ ...current, [plan.id]: next }));
    void ports.library
      .saveWristbandConfig(plan.id, next)
      .catch(() => undefined);
  };
  const setBookConfigs = (next: BookConfigs) => {
    setBooks(next);
    void ports.library.saveBookConfigs(next).catch(() => undefined);
  };
  // The binder's page numbers depend on the layout they are measured in;
  // a map measured for another source, config or paper is not reused.
  const bookKey = `${spec.format}:${resolved.label}:${resolved.plays.length}:${JSON.stringify(books.binder)}:${spec.options.detail}:${spec.options.mono}`;
  const optionsInUse: OutputOptions = useMemo(
    () =>
      spec.format === "callSheet" && sheetConfig
        ? { ...spec.options, callSheet: sheetConfig }
        : spec.format === "wristband" && bandConfig
          ? { ...spec.options, wristband: bandConfig }
          : spec.format === "binder" || spec.format === "handout"
            ? {
                ...spec.options,
                books,
                ...(pageMap && pageMap.key === bookKey
                  ? { pageMap: pageMap.map }
                  : {}),
              }
            : spec.options,
    [
      bandConfig,
      bookKey,
      books,
      pageMap,
      sheetConfig,
      spec.format,
      spec.options,
    ],
  );
  const acceptance = planLoading
    ? { ok: false as const, reason: "Reading the plan…" }
    : acceptSource(format, {
        kind: source.kind,
        playCount: resolved.plays.length,
        ...(source.kind === "plan"
          ? { prepared: source.copy === "current" || revision !== undefined }
          : {}),
      });
  const document = useMemo<OutputDocument | undefined>(() => {
    if (!acceptance.ok) return undefined;
    return buildOutputDocument(spec.format, resolved, optionsInUse, {
      concepts,
      formations,
      year: new Date().getFullYear(),
    });
  }, [
    acceptance.ok,
    concepts,
    formations,
    optionsInUse,
    resolved,
    spec.format,
  ]);

  const previewHtml = useMemo(
    () =>
      document?.kind === "html" && paper
        ? withPreviewCss(document.html, previewCss(paper, spec.options.mono))
        : undefined,
    [document, paper, spec.options.mono],
  );

  const [measured, setMeasured] = useState<{
    readonly html: string;
    readonly estimate: PageEstimate;
  }>();
  const estimate =
    measured && measured.html === previewHtml ? measured.estimate : undefined;
  // The page count is read off the preview's own layout once it has one.
  const measure = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc || !paper || !doc.body) return;
    setMeasured({
      html: frame.srcdoc,
      estimate: estimatePages(doc, paper),
    });
    if (spec.format === "binder") {
      // Page numbers as laid out; a second pass writes them into the book.
      const map = measureBookPages(doc, paper);
      setPageMap((current) =>
        current?.key === bookKey && samePageMap(current.map, map)
          ? current
          : { key: bookKey, map },
      );
    }
  }, [bookKey, paper, spec.format]);

  const run = async (how: "print" | "window" | "download") => {
    if (!document) return;
    setOutcome(undefined);
    if (document.kind === "html") {
      const result =
        how === "window"
          ? (ports.openWindow ?? printInWindow)(document.html)
          : await (ports.print ?? printInFrame)(document.html);
      setOutcome(result);
      if (result.ok) remember();
      return;
    }
    if (document.kind === "file") {
      downloadText(document.name, document.text, document.type);
    } else if (document.kind === "png") {
      try {
        downloadBlob(document.name, await pngFromSvg(document.svg));
      } catch {
        setOutcome({ ok: false, reason: "failed" });
        return;
      }
    } else if (document.kind === "frames") {
      const manifest = framesManifest(document.play);
      downloadText(manifest.name, manifest.text, "text/plain");
      let index = 0;
      for (let i = 0; i < document.count; i += 1) {
        index += 1;
        const atMs = i * 200;
        const blob = await pngFromSvg(document.svgAt(atMs));
        downloadBlob(manifest.frameName(index), blob);
      }
    } else {
      return;
    }
    setOutcome({ ok: "sent", what: "Saved to your downloads." });
    remember();
  };
  const remember = () =>
    onRan({
      name: `${format.name} — ${sourceNames[source.kind].toLowerCase()}`,
      format: spec.format,
      sourceKind: source.kind,
      detail: spec.options.detail,
      mono: spec.options.mono,
    });

  const setSource = (next: SourceChoice) => setSpec({ ...spec, source: next });
  const setOption = <K extends keyof OutputOptions>(
    key: K,
    value: OutputOptions[K],
  ) => setSpec({ ...spec, options: { ...spec.options, [key]: value } });

  const summary = [
    `${sourceNames[source.kind]}: ${resolved.label}`,
    resolved.unit,
    `${resolved.plays.length} ${resolved.plays.length === 1 ? "play" : "plays"}`,
    resolved.order,
    resolved.copy,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div aria-label="Print & export" className="output" role="region">
      <aside className="output-steps" aria-label="Choices">
        <section className="output-step">
          <h2>1 · Source</h2>
          <div className="output-choices" role="radiogroup" aria-label="Source">
            {(["current", "selection", "plan", "book"] as const).map((kind) => (
              <button
                aria-checked={source.kind === kind}
                className={source.kind === kind ? "active" : undefined}
                key={kind}
                onClick={() =>
                  setSource(
                    kind === "current"
                      ? { kind }
                      : kind === "selection"
                        ? {
                            kind,
                            playIds:
                              source.kind === "selection"
                                ? source.playIds
                                : [currentPlay.id],
                          }
                        : kind === "plan"
                          ? {
                              kind,
                              planId:
                                source.kind === "plan"
                                  ? source.planId
                                  : (plans[0]?.id ?? ""),
                              copy: "revision",
                            }
                          : { kind },
                  )
                }
                role="radio"
                type="button"
              >
                {sourceNames[kind]}
              </button>
            ))}
          </div>
          {source.kind === "selection" ? (
            <SelectionPicker
              chosen={source.playIds}
              onChange={(playIds) => setSource({ kind: "selection", playIds })}
              plays={libraryPlays?.plays ?? [currentPlay]}
            />
          ) : null}
          {source.kind === "plan" ? (
            <PlanPicker
              onChange={(next) => setSource({ ...source, ...next })}
              plan={plan}
              plans={plans}
              revision={revision}
              source={source}
            />
          ) : null}
          {source.kind === "book" ? (
            <p className="output-note">
              Every saved play in the library, in library order —{" "}
              {libraryPlays ? libraryPlays.plays.length : "…"} plays. Nothing
              here prints the whole book unless you choose it.
            </p>
          ) : null}
        </section>
        <section className="output-step">
          <h2>2 · Format</h2>
          {outputGroups.map((group) => (
            <div className="output-format-group" key={group}>
              <div className="menu-head">{group.toUpperCase()}</div>
              {outputFormats
                .filter((candidate) => candidate.group === group)
                .map((candidate) => {
                  const fit = acceptSource(candidate, {
                    kind: source.kind,
                    playCount: resolved.plays.length,
                    ...(source.kind === "plan"
                      ? {
                          prepared:
                            source.copy === "current" || revision !== undefined,
                        }
                      : {}),
                  });
                  return (
                    <button
                      aria-pressed={spec.format === candidate.id}
                      className={`output-format${spec.format === candidate.id ? " active" : ""}${fit.ok ? "" : " unfit"}`}
                      key={candidate.id}
                      onClick={() => setSpec({ ...spec, format: candidate.id })}
                      title={fit.ok ? candidate.hint : fit.reason}
                      type="button"
                    >
                      <span>{candidate.name}</span>
                      <small>{paperLabel(candidate.paper)}</small>
                    </button>
                  );
                })}
            </div>
          ))}
        </section>
        <section className="output-step">
          <h2>3 · Options</h2>
          {format.styled ? (
            <>
              <div className="sub-heading">Detail</div>
              <div className="segments">
                {detailPresets.map((preset) => (
                  <button
                    aria-pressed={spec.options.detail === preset.id}
                    className={
                      spec.options.detail === preset.id ? "active" : undefined
                    }
                    key={preset.id}
                    onClick={() => setOption("detail", preset.id)}
                    title={preset.hint}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <label className="output-check">
                <input
                  checked={spec.options.mono}
                  onChange={(event) => setOption("mono", event.target.checked)}
                  type="checkbox"
                />
                Monochrome — for a copier
              </label>
            </>
          ) : (
            <p className="output-note">
              This format fixes its own detail and colour.
            </p>
          )}
          {spec.format === "field" ? (
            <>
              <div className="sub-heading">Page</div>
              <div className="page-kinds">
                {pageKindCatalog.map((kind) => (
                  <button
                    aria-pressed={spec.options.pageKind === kind.id}
                    className={
                      spec.options.pageKind === kind.id ? "active" : undefined
                    }
                    key={kind.id}
                    onClick={() => setOption("pageKind", kind.id)}
                    type="button"
                  >
                    {kind.name}
                  </button>
                ))}
              </div>
              <div className="sub-heading">Type</div>
              <div className="segments">
                {typePresetCatalog.map((preset) => (
                  <button
                    aria-pressed={spec.options.typePreset === preset.id}
                    className={
                      spec.options.typePreset === preset.id
                        ? "active"
                        : undefined
                    }
                    key={preset.id}
                    onClick={() => setOption("typePreset", preset.id)}
                    title={preset.hint}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {spec.format === "callSheet" &&
          source.kind === "plan" &&
          sheetPlan &&
          resolved.revision &&
          sheetConfig ? (
            <CallSheetOptions
              config={sheetConfig}
              onChange={setSheetConfig}
              plan={sheetPlan}
              revision={resolved.revision}
            />
          ) : null}
          {spec.format === "wristband" &&
          source.kind === "plan" &&
          resolved.revision &&
          bandConfig ? (
            <WristbandOptions
              config={bandConfig}
              onChange={setBandConfig}
              revision={resolved.revision}
            />
          ) : null}
          {(spec.format === "binder" || spec.format === "handout") &&
          acceptance.ok ? (
            <BookOptions
              configs={books}
              entries={bookEntriesOf(resolved)}
              kind={spec.format}
              onChange={setBookConfigs}
            />
          ) : null}
          {spec.format === "position" ? (
            <>
              <div className="sub-heading">Group</div>
              <div className="segments">
                {positionGroupCatalog.map((group) => (
                  <button
                    aria-pressed={spec.options.positionGroup === group.id}
                    className={
                      spec.options.positionGroup === group.id
                        ? "active"
                        : undefined
                    }
                    key={group.id}
                    onClick={() => setOption("positionGroup", group.id)}
                    type="button"
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </aside>
      <div className="output-main">
        <div aria-label="What prints" className="output-summary" role="status">
          <strong>{format.name}</strong>
          <span>{summary}</span>
          <span>{paperLabel(paper)}</span>
          {estimate ? (
            <span>
              {estimate.pages} {estimate.pages === 1 ? "page" : "pages"}
              {estimate.overflow.length > 0
                ? ` — page ${estimate.overflow[0]!.page} runs ${estimate.overflow[0]!.inches} in over and flows onto another sheet`
                : ""}
            </span>
          ) : null}
        </div>
        {!acceptance.ok ? (
          <p className="output-blocked" role="alert">
            {acceptance.reason}
          </p>
        ) : document?.kind === "empty" ? (
          <p className="output-blocked" role="alert">
            {document.reason}
          </p>
        ) : null}
        <div className="output-preview" aria-label="Preview" role="region">
          {spec.format === "field" && acceptance.ok && resolved.plays[0] ? (
            <FieldSheet options={spec.options} play={resolved.plays[0]} />
          ) : previewHtml ? (
            <iframe
              className="output-frame"
              onLoad={measure}
              ref={frameRef}
              srcDoc={previewHtml}
              title="Preview"
            />
          ) : document && document.kind !== "empty" ? (
            <div className="output-file-preview">
              {document.kind === "png" || document.kind === "file" ? (
                <p>
                  {document.name} —{" "}
                  {document.kind === "png" ? "2000 × 1240 PNG" : "SVG"}
                </p>
              ) : document.kind === "frames" ? (
                <p>
                  {document.count} PNG frames and a manifest, saved one by one.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="output-actions">
          {format.delivery === "print" ? (
            <>
              <button
                className="menu-primary"
                disabled={!document || document.kind !== "html"}
                onClick={() => void run("print")}
                type="button"
              >
                Print…
              </button>
              <button
                className="output-secondary"
                disabled={!document || document.kind !== "html"}
                onClick={() => void run("print")}
                title="The browser's print dialog opens — choose Save as PDF there"
                type="button"
              >
                Save as PDF…
              </button>
              <button
                className="output-secondary"
                disabled={!document || document.kind !== "html"}
                onClick={() => void run("window")}
                type="button"
              >
                Open in a new tab
              </button>
            </>
          ) : (
            <button
              className="menu-primary"
              disabled={!document || document.kind === "empty"}
              onClick={() => void run("download")}
              type="button"
            >
              Download
            </button>
          )}
          <button className="output-secondary" onClick={onClose} type="button">
            Back to the editor
          </button>
          <span className="output-honest">
            {format.delivery === "print"
              ? "Print and Save as PDF both use the browser's print dialog; PDF is its Save as PDF choice."
              : "Downloads go to the browser's downloads folder."}
          </span>
        </div>
        {outcome ? (
          <p
            aria-label="Outcome"
            className={`output-outcome${outcome.ok === false ? " failed" : ""}`}
            role="status"
          >
            {outcome.ok === true
              ? outcome.via === "window"
                ? "Opened in a new tab and sent to print."
                : "Sent to print."
              : outcome.ok === "sent"
                ? outcome.what
                : outcome.reason === "blocked"
                  ? "The browser blocked the new tab. Print from here instead, or allow pop-ups for Chalk and try again."
                  : "Printing did not start. Try again, or open in a new tab."}
            {outcome.ok === false ? (
              <button
                className="output-secondary"
                onClick={() =>
                  void run(outcome.reason === "blocked" ? "print" : "window")
                }
                type="button"
              >
                {outcome.reason === "blocked"
                  ? "Print from here"
                  : "Open in a new tab"}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The letter-landscape field sheet, drawn in the page as the original's Print did. */
function FieldSheet({
  options,
  play,
}: {
  options: OutputOptions;
  play: PlayDocument;
}) {
  const scene = useMemo(
    () =>
      buildSvgRenderScene(
        buildRenderScene(play, {
          presentation: {
            pageKind: options.pageKind,
            typePreset: options.mono ? "print" : options.typePreset,
            layers: {
              reads: options.detail !== "diagram",
              assigns: options.detail !== "diagram",
              notes: options.detail === "full",
              text: options.detail !== "diagram",
            },
          },
        }),
      ),
    [options, play],
  );
  const typeName =
    typePresetCatalog.find(
      ({ id }) => id === (options.mono ? "print" : options.typePreset),
    )?.name ?? "Coach";
  return (
    <div
      aria-label="Print preview"
      className="print-mode print-inline"
      role="region"
    >
      <div className="print-sheet">
        <div className="print-margins">
          <div className="print-hd">
            <div className="print-title">{play.name}</div>
            <div className="print-cat">
              {play.unit === "defense" ? "Defense" : "Offense"}
              {play.playType ? ` · ${play.playType.name}` : ""}
            </div>
          </div>
          <div className="print-diagram">
            <FieldDiagram scene={scene} />
          </div>
        </div>
      </div>
      <div className="print-actions">
        <span>
          letter landscape · half-inch margins · {typeName.toLowerCase()} type
        </span>
      </div>
    </div>
  );
}

function SelectionPicker({
  chosen,
  onChange,
  plays,
}: {
  chosen: readonly string[];
  onChange: (playIds: readonly string[]) => void;
  plays: readonly PlayDocument[];
}) {
  const [query, setQuery] = useState("");
  const shown = plays.filter((play) =>
    play.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const move = (playId: string, by: -1 | 1) => {
    const index = chosen.indexOf(playId);
    const target = index + by;
    if (index < 0 || target < 0 || target >= chosen.length) return;
    const next = [...chosen];
    next.splice(index, 1);
    next.splice(target, 0, playId);
    onChange(next);
  };
  return (
    <div className="output-picker">
      <input
        aria-label="Find plays"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a play"
        type="search"
        value={query}
      />
      <ul className="output-pick-list" aria-label="Plays to pick">
        {shown.map((play) => (
          <li key={play.id}>
            <label>
              <input
                checked={chosen.includes(play.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, play.id]
                      : chosen.filter((id) => id !== play.id),
                  )
                }
                type="checkbox"
              />
              {play.name}
            </label>
          </li>
        ))}
      </ul>
      {chosen.length > 0 ? (
        <ol className="output-order" aria-label="Print order">
          {chosen.map((id, index) => {
            const play = plays.find((candidate) => candidate.id === id);
            return (
              <li key={id}>
                <span>{play?.name ?? id}</span>
                <button
                  aria-label={`Move ${play?.name ?? id} up`}
                  disabled={index === 0}
                  onClick={() => move(id, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${play?.name ?? id} down`}
                  disabled={index === chosen.length - 1}
                  onClick={() => move(id, 1)}
                  type="button"
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="output-note">Pick at least one play.</p>
      )}
    </div>
  );
}

function PlanPicker({
  onChange,
  plan,
  plans,
  revision,
  source,
}: {
  onChange: (next: Partial<Extract<SourceChoice, { kind: "plan" }>>) => void;
  plan: GamePlan | undefined;
  plans: readonly GamePlan[];
  revision: GamePlanRevision | undefined;
  source: Extract<SourceChoice, { kind: "plan" }>;
}) {
  if (plans.length === 0) {
    return (
      <p className="output-note">
        No game plans yet. Build one under Playbooks → Game plans.
      </p>
    );
  }
  return (
    <div className="output-plan">
      <label>
        Plan
        <select
          onChange={(event) =>
            onChange({ planId: event.target.value, sectionId: undefined })
          }
          value={source.planId}
        >
          {plans.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
              {gamePlanSubtitle(candidate)
                ? ` · ${gamePlanSubtitle(candidate)}`
                : ""}
              {` · ${unitName(candidate.unit)}`}
            </option>
          ))}
        </select>
      </label>
      {plan ? (
        <>
          <label>
            Section
            <select
              onChange={(event) =>
                onChange({ sectionId: event.target.value || undefined })
              }
              value={source.sectionId ?? ""}
            >
              <option value="">Whole plan</option>
              {plan.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <div
            className="segments output-copy"
            role="group"
            aria-label="Which copy"
          >
            <button
              aria-pressed={source.copy === "revision"}
              className={source.copy === "revision" ? "active" : undefined}
              disabled={!plan.preparedRevisionId}
              onClick={() => onChange({ copy: "revision" })}
              title={
                revision
                  ? `The packet as prepared — ${preparedStamp(revision)}`
                  : "Prepare the plan under Game plans first"
              }
              type="button"
            >
              {revision
                ? `Prepared ${preparedStamp(revision).replace(/^Prepared /, "")}`
                : "Not prepared"}
            </button>
            <button
              aria-pressed={source.copy === "current"}
              className={source.copy === "current" ? "active" : undefined}
              onClick={() => onChange({ copy: "current" })}
              title="The plays as they are in the library now"
              type="button"
            >
              Current plays
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
