// TraceLensHero.jsx
// Main Hero Section component for TraceLens Home Page

import React from "react";
import { motion } from "framer-motion";
import cardIntake from "../assets/hero-card-intake.png";
import cardLogic from "../assets/hero-card-logic.png";
import cardModel from "../assets/hero-card-model.png";

function Chip({ children, tone = "cyan", onClick, className = "" }) {
  const toneClasses =
    tone === "cyan"
      ? "border-sky-500/50 text-sky-400 bg-slate-900/60 hover:bg-sky-950/40"
      : "border-orange-500/50 text-orange-400 bg-slate-900/60 hover:bg-orange-950/40";
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-mono font-bold tracking-wider transition-colors ${toneClasses} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

export default function TraceLensHero({ onTraceScriptClick, onSelectMode }) {
  const handleScrollToTryIt = (e) => {
    e.preventDefault();
    const tryItElement = document.getElementById("try-it");
    if (tryItElement) {
      tryItElement.scrollIntoView({ behavior: "smooth" });
    }
    if (onTraceScriptClick) {
      onTraceScriptClick();
    }
  };

  const handleSelectModeAndScroll = (selectedMode) => {
    if (onSelectMode) {
      onSelectMode(selectedMode);
    }
    const tryItElement = document.getElementById("try-it");
    if (tryItElement) {
      tryItElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative isolate overflow-hidden min-h-[720px] px-6 py-16 sm:px-10 lg:px-16">

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
        {/* ---- left: copy ---- */}
        <div>
          <div className="mb-6 flex flex-wrap gap-3">
            <Chip tone="cyan">AST-DETERMINISTIC</Chip>
            <Chip 
              tone="orange"
              onClick={() => handleSelectModeAndScroll("logic_lens")}
              className="hover:scale-105 transition-transform"
            >
              LOGICLENS + MODELLENS
            </Chip>
          </div>

          <h1 className="text-6xl font-extrabold tracking-tight text-sky-400 sm:text-7xl">
            TraceLens
          </h1>

          <p className="mt-6 max-w-xl text-xl text-white font-medium leading-relaxed">
            Deterministic runtime execution visualizer &amp; ML methodology auditor.
          </p>
          <p className="mt-3 max-w-md text-sm text-slate-300 leading-normal">
            Turn a teammate&rsquo;s black-box script into a step-by-step,
            ground-truth replay.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#try-it"
              onClick={handleScrollToTryIt}
              className="rounded-full bg-sky-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-300 hover:shadow-[0_0_24px_rgba(56,189,248,0.4)] flex items-center gap-2 group cursor-pointer"
            >
              <span>Trace a script</span>
              <span className="transition-transform group-hover:translate-x-1 font-bold">&rarr;</span>
            </a>
            <span className="inline-flex items-center rounded-full border border-orange-500/50 bg-[#1A1008] px-5 py-3 text-sm font-bold text-orange-400">
              ⚡ Built for the IBM Bob 2.0 Hackathon
            </span>
          </div>

          <div className="mt-8 flex items-center gap-4 text-xs font-mono text-slate-400">
            <a
              href="https://github.com/Omar-astro/Tracelens"
              target="_blank"
              rel="noreferrer"
              className="hover:text-sky-300 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              <span>github.com/Omar-astro/Tracelens</span>
            </a>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">Zero-LLM-Hallucination Execution</span>
          </div>
        </div>

        {/* ---- right: floating screenshot collage ---- */}
        <div className="relative hidden h-[620px] lg:block">
          {/* Card Model - floats with staggered easeInOut */}
          <motion.img
            src={cardModel}
            alt="ModelLens remediation panel"
            style={{ rotate: "7deg" }}
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-4 top-0 w-[280px] rounded-2xl border-2 border-slate-700/80 shadow-2xl shadow-black/60 hover:border-purple-400 hover:shadow-[0_0_0_1px_rgba(192,132,252,0.9),0_0_20px_rgba(192,132,252,0.35),0_20px_40px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-300"
          />

          {/* Card Logic */}
          <motion.img
            src={cardLogic}
            alt="LogicLens loop visualizer and state inspector"
            style={{ rotate: "-6deg" }}
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            className="absolute right-16 top-56 w-[270px] rounded-2xl border-2 border-slate-700/80 shadow-2xl shadow-black/60 hover:border-sky-400 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.9),0_0_20px_rgba(56,189,248,0.35),0_20px_40px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-300"
          />

          {/* Card Intake */}
          <motion.img
            src={cardIntake}
            alt="TraceLens intake screen"
            style={{ rotate: "-3deg" }}
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
            className="absolute left-0 bottom-4 w-[380px] rounded-2xl border-2 border-slate-700/80 shadow-2xl shadow-black/60 hover:border-orange-400 hover:shadow-[0_0_0_1px_rgba(251,140,70,0.9),0_0_20px_rgba(251,140,70,0.35),0_20px_40px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-300"
          />
        </div>
      </div>
    </section>
  );
}
