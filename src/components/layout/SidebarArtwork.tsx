import { useId } from 'react';

// Decorative engineering drawing from Metall-formulas/sidebar-art.svg.
export function SidebarArtwork() {
  const drawingId = useId().replace(/:/g, '');
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="sidebar-art" viewBox="0 0 300 1000" preserveAspectRatio="xMaxYMin meet" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${drawingId}-sidebar-drawing-grid`} width="25" height="25" patternUnits="userSpaceOnUse">
          <path d="M25 0H0V25" fill="none" stroke="currentColor" strokeWidth=".45" strokeOpacity=".12"/>
        </pattern>
        <pattern id={`${drawingId}-sidebar-drawing-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V7" fill="none" stroke="currentColor" strokeWidth=".7" strokeOpacity=".55"/>
        </pattern>
        <linearGradient id={`${drawingId}-sidebar-drawing-visibility`}>
          <stop offset="0" stopColor="white" stopOpacity=".06"/>
          <stop offset=".4" stopColor="white" stopOpacity=".3"/>
          <stop offset=".7" stopColor="white" stopOpacity=".85"/>
          <stop offset="1" stopColor="white"/>
        </linearGradient>
        <mask id={`${drawingId}-sidebar-drawing-mask`}>
          <rect width="300" height="1000" fill={`url(#${drawingId}-sidebar-drawing-visibility)`}/>
        </mask>
        <marker id={`${drawingId}-sidebar-drawing-arrow`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="m0 0 6 3-6 3Z" fill="currentColor"/>
        </marker>
      </defs>
      <g mask={`url(#${drawingId}-sidebar-drawing-mask)`}>
        <rect width="300" height="1000" fill={`url(#${drawingId}-sidebar-drawing-grid)`}/>
        <g fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round">
          <g strokeOpacity=".22">
            <path d="M0 193 32 162H161M0 299l83-78h50M11 651l74-75h71M1 933h299M271 0v1000"/>
            <path d="M98 90a114 114 0 0 1 202 0M106 90a106 106 0 0 0 194 59M83 654a170 170 0 0 1 165 239M26 610a214 214 0 0 1 257 319"/>
            <path d="M35 465v-12a14 14 0 0 1 14-14h54M146 261l53-52h79M160 602l54 46v70"/>
          </g>

          <g className="sidebar-flange">
            <circle cx="212" cy="90" r="76" strokeOpacity=".28"/>
            <circle cx="212" cy="90" r="62"/>
            <circle cx="212" cy="90" r="50" strokeDasharray="24 5" strokeOpacity=".55"/>
            <circle cx="212" cy="90" r="27"/>
            <circle cx="212" cy="90" r="24" strokeOpacity=".6"/>
            <g strokeWidth="1.1">
              <circle cx="255.84" cy="46.16" r="7.5"/><circle cx="255.84" cy="133.84" r="7.5"/>
              <circle cx="168.16" cy="46.16" r="7.5"/><circle cx="168.16" cy="133.84" r="7.5"/>
            </g>
            <g strokeDasharray="11 4 2 4" strokeOpacity=".6"><path d="M212 0v178M116 90h184M155 33l114 114M155 147 269 33"/></g>
            <path d="m253 42 23-23h24m-43 113 22 10h21" strokeOpacity=".85"/>
            <path d="M166 184v24m112-24v24"/>
            <path d="M166 201h112" markerStart={`url(#${drawingId}-sidebar-drawing-arrow)`} markerEnd={`url(#${drawingId}-sidebar-drawing-arrow)`}/>
          </g>

          <g className="sidebar-bearing">
            <g strokeOpacity=".2"><path d="M167 365V284l35-35h98M165 502v54l47 47h88M177 365h119M177 502h119"/><circle cx="237" cy="431" r="127"/><circle cx="237" cy="431" r="140" strokeDasharray="24 7"/></g>
            <path d="M222 280h24v46q0 16 16 16h32v178h-32q-16 0-16 16v46h-24q-9 0-9-14v-18q0-30-20-40l-18-8V365l18-8q20-10 20-40v-23q0-14 9-14Zm-20 94q-10 0-10 10v100q0 10 10 10h57q10 0 10-10V384q0-10-10-10Z" fill={`url(#${drawingId}-sidebar-drawing-hatch)`} fillRule="evenodd"/>
            <path d="M228 292h10v34q0 24 23 24h24v162h-24q-23 0-23 24v34h-10v-20q0-37-29-49l-14-7V373l14-7q29-12 29-49Z" strokeOpacity=".45"/>
            <rect x="201" y="379" width="58" height="110" rx="5"/>
            <path d="M204 388h42v20h-42m0 46h42v26h-42M246 388q9 0 9 10v72q0 10-9 10"/>
            <path d="M204 392h13m15 0h13m-41 84h13m15 0h13M205 407h12m15 0h13m-40 48h12m15 0h13" strokeOpacity=".65"/>
            <circle cx="224" cy="400" r="8"/><circle cx="224" cy="468" r="8"/>
            <circle cx="224" cy="400" r="6.2" strokeOpacity=".45"/><circle cx="224" cy="468" r="6.2" strokeOpacity=".45"/>
            <path d="M86 418h25v-4h15v-6h34v-4h36v-5h8v70h-8v-11h-36v-4h-34v-6h-15v-4H86q-5 0-5-5v-16q0-5 5-5Z"/>
            <path d="M111 418v26m15-30v34m34-40v46m36-50v54M86 421h25m-25 20h25" strokeOpacity=".55"/>
            <path d="M204 413h39v42h-39m39-42v42"/>
            <path d="M40 431h260" strokeDasharray="13 4 2 4" strokeOpacity=".65"/>
            <path d="M54 418h26m-26 26h26"/>
            <path d="M60 418v26" markerStart={`url(#${drawingId}-sidebar-drawing-arrow)`} markerEnd={`url(#${drawingId}-sidebar-drawing-arrow)`}/>
          </g>

          <g className="sidebar-section">
            <circle cx="224" cy="824" r="32" fill={`url(#${drawingId}-sidebar-drawing-hatch)`}/>
            <path d="M219 792v-19h10v19m-10-5v14h10v-14"/>
            <path d="M178 824h92M224 762v108" strokeDasharray="11 4 2 4" strokeOpacity=".65"/>
            <path d="M258 792h22m-22 64h22"/>
            <path d="M274 792v64" markerStart={`url(#${drawingId}-sidebar-drawing-arrow)`} markerEnd={`url(#${drawingId}-sidebar-drawing-arrow)`}/>
            <path d="M219 768v-9m10 9v-9"/>
            <path d="M219 765h10" markerStart={`url(#${drawingId}-sidebar-drawing-arrow)`} markerEnd={`url(#${drawingId}-sidebar-drawing-arrow)`}/>
            <path d="M47 945h249M192 945v-15m-5 15 5-7 5 7Z"/>
            <rect x="184" y="914" width="16" height="16"/>
            <rect x="96" y="905" width="65" height="15"/>
            <path d="M111 905v15m35-15v15m-47-7.5h9m-4.5-4.5v9"/>
            <circle cx="103.5" cy="912.5" r="3.2"/>
            <path d="M96 918H84l-24 27" markerEnd={`url(#${drawingId}-sidebar-drawing-arrow)`}/>
          </g>
        </g>
        <g fill="currentColor" fontFamily="Cambria,Georgia,serif" fontSize="10" fontStyle="italic">
          <text x="235" y="14">⌀72 h7</text><text x="261" y="137">4×⌀9</text>
          <text x="222" y="194" textAnchor="middle">120</text>
          <text x="52" y="431" textAnchor="middle" transform="rotate(-90 52 431)">⌀36</text>
          <text x="213" y="754">A–A</text><text x="237" y="759">10 h9</text><text x="282" y="828">⌀52</text>
          <text x="114" y="916" fontSize="8">0,02 A</text><text x="192" y="926" textAnchor="middle" fontStyle="normal">A</text>
        </g>
      </g>
    </svg>
  );
}
