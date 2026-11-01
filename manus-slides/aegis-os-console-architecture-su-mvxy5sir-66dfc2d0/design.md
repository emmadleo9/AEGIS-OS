## Design Concept
This deck serves as a technical architecture report for an upward-facing engineering review, delivering precise telemetry and system observability metrics. The visual foundation anchors on Aerospace HUD (Head-Up Display) and Military-Grade Console design, borrowing its stark, unvarnished grid layouts, monospace typography, and ultra-thin framing. The color story is aggressively cool and technical: it utilizes the requested near-black `#050A0E` canvas and high-intensity cyan `#8AF8FF` accents, creating a high-contrast, light-emitting aesthetic. We bypass the cliché "90s hacker matrix green" entirely, opting instead for a clinical, aviation-inspired palette of deep slate and cold white to maintain executive credibility. The typographic voice is purely mechanical, utilizing engineered monospace and technical sans-serif fonts to enforce a data-first, terminal-command register. 

## Visual Language
- **Imagery**: Supporting role only. Strictly limited to architecture diagrams, wireframes, and data visualizations. Photography is banned.
- **Containers**: Sparse HUD framing. Use whitespace-first layouts bounded by ultra-thin (1px) sharp-cornered borders. Cards have no background fill, relying entirely on perimeter lines and corner brackets for definition.
- **Icons**: Outline styles only, strictly utilized as technical node markers in diagrams or metric anchors.
- **Dataviz**: High-contrast, unstyled gridlines. Tables use 1px borders with monospaced data alignment. Charts use `#8AF8FF` for the primary data series and `#FFB347` for secondary/alert data, rendered with crisp, non-smoothed lines and no area fills. 
- **Motif**: A raw telemetry string (e.g., `AEGIS v3.2 // SYS.OP.[ACTIVE]`) set in 12px monospace, positioned in the top right corner of every slide, enclosed by 1px cyan left/right brackets.

## Layout Directives
- **Global**: 40px margins on all sides. Strict 12-column grid alignment. Page numbers at bottom right in `[ 01 / 07 ]` format.
- **Cover**: Large, left-aligned typography bounded by a wireframe box, featuring a raw terminal-style metadata block at the bottom left.
- **Table of Contents**: A numbered pipeline diagram mapping the logical flow of the system components, never a bulleted list.
- **Section Dividers**: Stark, centered terminal commands (e.g., `> EXECUTE: MODULE_LOAD`) with high-contrast metric callouts.
- **Closing**: Echoes the cover wireframe structure, concluding with an `[ END OF TRANSMISSION ]` terminal output.
- **Slide Map**:

| id | pattern | image | density |
|---|---|---|---|
| cover | HUD wireframe layout with large display type | none | low |
| system_map | Full-slide interconnected node diagram | supporting | high |
| runtime_shell | Two-column grid with routing table | none | medium |
| world_pipeline | Flowchart diagram over data processing steps | supporting | high |
| telemetry | Dashboard layout with sparklines and metric cards | none | high |
| interaction_design | Component wireframe gallery with annotations | supporting | medium |
| delivery | Four-quadrant matrix for validation and next steps | none | medium |

## Design Tokens

| token | hex | usage |
|---|---|---|
| canvas | #050A0E | Global page background (requested near-black) |
| surface | #0F171E | Subtle tinted block background for diagnostic zones |
| border | #1E3A5F | Thin technical rules and HUD container framing |
| accent-cyan | #8AF8FF | Telemetry accents, headline metrics, primary chart series |
| accent-amber | #FFB347 | Warning metrics, secondary chart series, highlight nodes |
| text-main | #E2F1F8 | High-contrast body text and standard labels |
| text-muted | #6B8A9C | Secondary text, captions, gridlines, axis labels |

| role | family | size (px) | applies_to |
|---|---|---|---|
| display | Share Tech Mono | 48 | Cover title, major diagnostic verdicts |
| heading | Share Tech Mono | 28 | Slide titles, structural component names |
| metric | Share Tech Mono | 38 | High-priority telemetry numbers and KPIs |
| body | Roboto Mono | 18 | Prose, achievement bullets, standard UI data |
| caption | Roboto Mono | 14 | Footnotes, motif string, axis labels, routing paths |

## Guardrails
- **Forbidden**: Soft drop shadows or glow effects (violates the flat HUD lighting model).
- **Forbidden**: Rounded corners (border-radius must be strictly 0px).
- **Forbidden**: Gradient backgrounds (interferes with the stark terminal contrast).
- **Forbidden**: Any pure white `#FFFFFF` (too harsh against the near-black canvas; use `text-main`).
- **Forbidden**: Paragraphs longer than 3 lines (all text must be modular and scannable).
