const units = {
  mm: { name: "밀리미터", symbol: "mm", meters: 0.001 },
  cm: { name: "센티미터", symbol: "cm", meters: 0.01 },
  m: { name: "미터", symbol: "m", meters: 1 },
  km: { name: "킬로미터", symbol: "km", meters: 1000 },
  in: { name: "인치", symbol: "in", meters: 0.0254 },
  ft: { name: "피트", symbol: "ft", meters: 0.3048 },
  yd: { name: "야드", symbol: "yd", meters: 0.9144 },
  mi: { name: "마일", symbol: "mi", meters: 1609.344 }
};

const amount = document.querySelector("#amount");
const fromUnit = document.querySelector("#fromUnit");
const toUnit = document.querySelector("#toUnit");
const resultValue = document.querySelector("#resultValue");
const resultUnit = document.querySelector("#resultUnit");
const quickGrid = document.querySelector("#quickGrid");
const baseLabel = document.querySelector("#baseLabel");

for (const [key, unit] of Object.entries(units)) {
  const label = `${unit.name} (${unit.symbol})`;
  fromUnit.add(new Option(label, key));
  toUnit.add(new Option(label, key));
}
fromUnit.value = "m";
toUnit.value = "cm";

function format(value) {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && (Math.abs(value) >= 1e9 || Math.abs(value) < 1e-6)) return value.toExponential(6);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 8 }).format(value);
}

function convert(value, from, to) {
  return value * units[from].meters / units[to].meters;
}

function update() {
  const value = Number(amount.value);
  const valid = amount.value !== "" && Number.isFinite(value);
  const result = valid ? convert(value, fromUnit.value, toUnit.value) : NaN;
  resultValue.textContent = format(result);
  resultUnit.textContent = units[toUnit.value].name;
  baseLabel.textContent = valid ? `${format(value)} ${units[fromUnit.value].name} 기준` : "값을 입력해 주세요";

  quickGrid.replaceChildren();
  Object.entries(units).filter(([key]) => key !== fromUnit.value).slice(0, 6).forEach(([key, unit]) => {
    const card = document.createElement("div");
    card.className = "quick-card";
    card.innerHTML = `<span>${unit.name}</span><strong>${format(valid ? convert(value, fromUnit.value, key) : NaN)} ${unit.symbol}</strong>`;
    quickGrid.append(card);
  });
}

amount.addEventListener("input", update);
fromUnit.addEventListener("change", update);
toUnit.addEventListener("change", update);
document.querySelector("#swapButton").addEventListener("click", () => {
  [fromUnit.value, toUnit.value] = [toUnit.value, fromUnit.value];
  update();
});
document.querySelector("#copyButton").addEventListener("click", async (event) => {
  const text = `${resultValue.textContent} ${units[toUnit.value].symbol}`;
  await navigator.clipboard.writeText(text);
  event.currentTarget.textContent = "복사 완료";
  setTimeout(() => { event.currentTarget.textContent = "결과 복사"; }, 1200);
});
document.querySelector("#themeButton").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");
update();
