import { useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

/** View tuned for Malaysia + Singapore + Philippines */
const MAP_CENTER = [113, 7];
const MAP_SCALE  = 1900;

/** Key coordinates */
const SG_COORD = [103.8198, 1.3521];
const MY_LABEL = [103.5, 4.5];
const PH_LABEL = [122.0, 13.0];
const SG_LABEL = [104.2, 1.7];

/** world-atlas name → canonical */
const NAME_ALIASES = {
  Singapore: ["Singapore"],
  Malaysia: ["Malaysia"],
  Philippines: ["Philippines"],
  Thailand: ["Thailand"],
  Indonesia: ["Indonesia"],
  Cambodia: ["Cambodia"],
  "Viet Nam": ["Vietnam", "Viet Nam"],
  Laos: ["Laos", "Lao PDR", "Lao People's Democratic Republic"],
  Myanmar: ["Myanmar"],
  Brunei: ["Brunei", "Brunei Darussalam"],
};

/** Focus for styling */
const FOCUS_CANON = ["Malaysia", "Singapore", "Philippines"];

/** Palette */
const COLORS = {
  dataBaseRGB: [43, 106, 230],
  stroke: "#bcd3ff",
  baseContextFill: "#f1f6ff",
  baseContextStroke: "#e6efff",

  hoverFill: "#fee2e2",
  hoverStroke: "#ef4444",
  activeFill: "#ef4444",
  activeStroke: "#b91c1c",
  redGlow: "drop-shadow(0 0 5px rgba(239,68,68,.35))",
};

const rgba = ([r,g,b], a) => `rgba(${r},${g},${b},${a})`;

/**
 * Controlled component:
 *  - `selected`: string | null  (country name to highlight)
 *  - `onSelectRegion(name)` called when user clicks a focus country
 */
export default function ASEANMap({ counts = {}, selected = null, onSelectRegion }) {
  const atlasToCanon = useMemo(() => {
    const m = {};
    Object.entries(NAME_ALIASES).forEach(([atlas, arr]) => (m[atlas] = arr[0] || atlas));
    return m;
  }, []);

  const isFocus = (atlasName) => FOCUS_CANON.includes(atlasToCanon[atlasName] || atlasName);

  const maxCount = Math.max(1, ...Object.values(counts));
  const baseBlueFor = (canon) => {
    const c = counts[canon] || 0;
    const alpha = 0.18 + 0.62 * (c / maxCount);
    return rgba(COLORS.dataBaseRGB, +alpha.toFixed(3));
  };

  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const handleClick = (canon) => {
    if (onSelectRegion) onSelectRegion(canon);
  };

  return (
    <div ref={wrapRef} className="asean-map-wrap">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: MAP_CENTER, scale: MAP_SCALE }}
        onMouseLeave={() => setHover(null)}
      >
        <Geographies geography={geoUrl}>
          {({ geographies }) => {
            const ctx = [];
            const focus = [];
            geographies.forEach((g) => (isFocus(g.properties.name) ? focus : ctx).push(g));

            return (
              <>
                {/* Context countries */}
                {ctx.map((geo) => (
                  <Geography
                    key={`ctx-${geo.rsmKey}`}
                    geography={geo}
                    fill={COLORS.baseContextFill}
                    stroke={COLORS.baseContextStroke}
                    strokeWidth={0.6}
                    style={{ default:{outline:"none"}, hover:{outline:"none"}, pressed:{outline:"none"} }}
                  />
                ))}

                {/* Focus countries */}
                {focus.map((geo) => {
                  const atlas = geo.properties.name;
                  const canon = atlasToCanon[atlas] || atlas;

                  const isSelected = selected === canon;
                  const baseFill = baseBlueFor(canon);

                  return (
                    <Geography
                      key={`foc-${geo.rsmKey}`}
                      geography={geo}
                      style={{
                        default: {
                          fill: isSelected ? COLORS.activeFill : baseFill,
                          stroke: isSelected ? COLORS.activeStroke : COLORS.stroke,
                          strokeWidth: isSelected ? 1.2 : 0.9,
                          outline: "none",
                          transition: "fill .25s ease, stroke .25s ease",
                        },
                        hover: {
                          fill: isSelected ? COLORS.activeFill : COLORS.hoverFill,
                          stroke: isSelected ? COLORS.activeStroke : COLORS.hoverStroke,
                          strokeWidth: 1.3,
                          outline: "none",
                          filter: COLORS.redGlow,
                          cursor: "pointer",
                        },
                        pressed: {
                          fill: COLORS.activeFill,
                          stroke: COLORS.activeStroke,
                          strokeWidth: 1.3,
                          outline: "none",
                          filter: COLORS.redGlow,
                        },
                      }}
                      onMouseEnter={() => setHover(canon)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => handleClick(canon)}
                    />
                  );
                })}

                {/* Singapore marker reacts to selection/hover */}
                <Marker coordinates={SG_COORD}>
                  <circle
                    r={6.2}
                    fill={selected === "Singapore" || hover === "Singapore" ? COLORS.activeFill : rgba(COLORS.dataBaseRGB, 0.9)}
                    stroke={selected === "Singapore" || hover === "Singapore" ? COLORS.activeStroke : "#ffffff"}
                    strokeWidth={1.6}
                    onMouseEnter={() => setHover("Singapore")}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => handleClick("Singapore")}
                    style={{ transition: "fill .2s ease, stroke .2s ease", cursor: "pointer" }}
                  />
                </Marker>

                {/* Labels */}
                <Marker coordinates={MY_LABEL}><LabelPill>Malaysia</LabelPill></Marker>
                <Marker coordinates={PH_LABEL}><LabelPill>Philippines</LabelPill></Marker>
                <Marker coordinates={SG_LABEL}><LabelPill>Singapore</LabelPill></Marker>
              </>
            );
          }}
        </Geographies>
      </ComposableMap>

      {/* Bottom-left info */}
      <div className="asean-selected">
        {hover
          ? `${hover}: ${counts[hover] || 0} articles`
          : selected
          ? `${selected}: ${counts[selected] || 0} articles`
          : "Click a country to filter (click again to clear)"}
      </div>
    </div>
  );
}

function LabelPill({ children }) {
  return (
    <g transform="translate(0,0)" style={{ pointerEvents: "none" }}>
      <foreignObject x={-40} y={-22} width="120" height="28">
        <div
          style={{
            display: "inline-block",
            padding: "4px 8px",
            background: "rgba(255,255,255,.8)",
            border: "1px solid rgba(43,106,230,.18)",
            borderRadius: 999,
            fontSize: 12,
            color: "#0b2a4a",
            fontWeight: 700,
            backdropFilter: "blur(4px)",
            boxShadow: "0 6px 20px rgba(43,106,230,.08)",
          }}
        >
          {children}
        </div>
      </foreignObject>
    </g>
  );
}
