// ─── CONSTANTS ──────────────────────────────────────────────────
const MAX_INVESTMENT = 20000000;
const STORAGE_KEY = "iperammortamento2026_data";

// ─── STATE ──────────────────────────────────────────────────────
let investments = [];
let rowId = 0;
let doughnutChart = null;
let activeAmortIndex = 0;

// ─── THEME TOGGLE ───────────────────────────────────────────────
document.getElementById("themeToggle").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    const d = document.documentElement.classList.contains("dark");
    document.getElementById("themeIcon").className = d
        ? "fa-solid fa-sun text-amber-400 text-sm"
        : "fa-solid fa-moon text-slate-500 text-sm";
    localStorage.setItem("iperammortamento_theme", d ? "dark" : "light");
});

// Restore theme preference
(function restoreTheme() {
    const saved = localStorage.getItem("iperammortamento_theme");
    if (saved === "light") {
        document.documentElement.classList.remove("dark");
        document.getElementById("themeIcon").className = "fa-solid fa-moon text-slate-500 text-sm";
    }
})();

// ─── UTILITY: ESCAPE HTML (XSS PREVENTION) ─────────────────────
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ─── FORMAT ─────────────────────────────────────────────────────
function fmt(v) {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
    }).format(v);
}

function pct(v) {
    return (v || 0).toFixed(2).replace(".", ",") + "%";
}

// ─── TOAST NOTIFICATION ─────────────────────────────────────────
function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

// ─── LOCAL STORAGE ──────────────────────────────────────────────
function saveToStorage() {
    const data = {
        iresRate: document.getElementById("iresRate").value,
        investments: investments.map(r => ({ desc: r.desc, amount: r.amount, coeff: r.coeff }))
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        // localStorage might be full or unavailable
    }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

// ─── VALIDATION ─────────────────────────────────────────────────
function validateAmount(value) {
    const num = parseFloat(value) || 0;
    if (num < 0) return { valid: false, value: 0, error: "L'importo non può essere negativo" };
    if (num > MAX_INVESTMENT) return { valid: false, value: MAX_INVESTMENT, error: "Tetto massimo: " + fmt(MAX_INVESTMENT) };
    return { valid: true, value: num, error: null };
}

function validateCoeff(value) {
    const num = parseFloat(value) || 0;
    if (num < 0) return { valid: false, value: 0, error: "Il coefficiente non può essere negativo" };
    if (num > 100) return { valid: false, value: 100, error: "Massimo 100%" };
    return { valid: true, value: num, error: null };
}

// ─── CALCOLA BONUS DA IMPORTO ───────────────────────────────────
function calcBonus(amount) {
    const s1 = Math.min(amount, 2500000);
    const b1 = s1 * 1.80;
    const s2 = amount > 2500000 ? Math.min(amount - 2500000, 7500000) : 0;
    const b2 = s2 * 1.00;
    const s3 = amount > 10000000 ? Math.min(amount - 10000000, 10000000) : 0;
    const b3 = s3 * 0.50;
    return { s1, b1, s2, b2, s3, b3, total: b1 + b2 + b3 };
}

// ─── ADD ROW ────────────────────────────────────────────────────
function addRow(desc = "", amount = 100000, coeff = 20) {
    const id = ++rowId;
    investments.push({ id, desc, amount, coeff });

    const div = document.createElement("div");
    div.id = "row-" + id;
    div.className = "inv-row p-3 rounded-xl border border-slate-100 dark:border-[#1A2E4A] bg-white dark:bg-[#040B17]";

    const descLabel = "desc-" + id;
    const amountLabel = "amount-" + id;
    const coeffLabel = "coeff-" + id;
    const safeDesc = escapeHtml(desc || "Investimento " + id);

    div.innerHTML = `
        <div>
            <label for="${descLabel}" class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrizione</label>
            <input type="text" id="${descLabel}" value="${safeDesc}" oninput="updateRow(${id},'desc',this.value)" class="form-input" placeholder="Es: Robot palettizzatore">
        </div>
        <div>
            <label for="${amountLabel}" class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Importo (&euro;)</label>
            <input type="number" id="${amountLabel}" value="${amount}" min="0" max="${MAX_INVESTMENT}" oninput="updateRow(${id},'amount',this.value)" class="form-input" placeholder="100000">
        </div>
        <div>
            <label for="${coeffLabel}" class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coeff. Ammort. (%)</label>
            <input type="number" id="${coeffLabel}" value="${coeff}" min="0" max="100" oninput="updateRow(${id},'coeff',this.value)" class="form-input" placeholder="20">
        </div>
        <button class="del-btn no-print" onclick="removeRow(${id})" title="Rimuovi investimento" aria-label="Rimuovi investimento ${safeDesc}">
            <i class="fa-solid fa-trash-can text-xs"></i>
        </button>`;
    document.getElementById("inv-list").appendChild(div);
    calculate();
}

function updateRow(id, field, val) {
    const r = investments.find(r => r.id === id);
    if (!r) return;

    if (field === "desc") {
        r[field] = val;
    } else if (field === "amount") {
        const v = validateAmount(val);
        r.amount = v.value;
        if (!v.valid) {
            const input = document.querySelector("#row-" + id + " input[type=number]");
            if (input) input.classList.add("input-error");
            showToast(v.error);
            setTimeout(() => { if (input) input.classList.remove("input-error"); }, 2000);
        }
    } else if (field === "coeff") {
        const v = validateCoeff(val);
        r.coeff = v.value;
        if (!v.valid) {
            showToast(v.error);
        }
    }
    calculate();
}

function removeRow(id) {
    const idx = investments.findIndex(r => r.id === id);
    if (idx !== -1) investments.splice(idx, 1);
    const el = document.getElementById("row-" + id);
    if (el) el.remove();
    if (activeAmortIndex >= investments.length) activeAmortIndex = Math.max(0, investments.length - 1);
    calculate();
}

// ─── RESET ──────────────────────────────────────────────────────
function resetAll() {
    investments = [];
    rowId = 0;
    activeAmortIndex = 0;
    document.getElementById("inv-list").innerHTML = "";
    document.getElementById("iresRate").value = "24";
    localStorage.removeItem(STORAGE_KEY);
    addRow("Investimento 1", 100000, 20);
    showToast("Dati resettati");
}

// ─── CALCULATE ──────────────────────────────────────────────────
function calculate() {
    const iresRate = (parseFloat(document.getElementById("iresRate").value) || 24) / 100;
    const rateLabel = pct(iresRate * 100);

    // Update labels
    document.getElementById("lbl-tax-base").textContent = "Risparmio IRES (" + rateLabel + ")";
    document.getElementById("lbl-tax-total").textContent = "Risparmio IRES (" + rateLabel + ")";
    document.getElementById("lbl-tax-net").textContent = "Bonus IRES Netto (" + rateLabel + ")";
    document.getElementById("nota-risparmio").innerHTML =
        "Il risparmio reale \u00e8 calcolato all'aliquota <strong>IRES " + rateLabel + "</strong>. Le deduzioni indicano l'importo che riduce il reddito imponibile.";

    let totalInv = 0, totalBonus = 0;
    let ts1 = 0, ts2 = 0, ts3 = 0, tb1 = 0, tb2 = 0, tb3 = 0;

    const summaryBody = document.getElementById("invSummaryTable");
    summaryBody.innerHTML = "";

    investments.forEach(r => {
        const b = calcBonus(r.amount);
        totalInv += r.amount;
        totalBonus += b.total;
        ts1 += b.s1; tb1 += b.b1;
        ts2 += b.s2; tb2 += b.b2;
        ts3 += b.s3; tb3 += b.b3;

        const safeDesc = escapeHtml(r.desc || "\u2014");
        summaryBody.insertAdjacentHTML("beforeend", `
            <tr class="hover:bg-slate-50 dark:hover:bg-[#0D1E35] transition-colors">
                <td class="p-3 text-sm font-semibold text-slate-700 dark:text-slate-200">${safeDesc}</td>
                <td class="p-3 text-sm mono text-slate-600 dark:text-slate-300">${fmt(r.amount)}</td>
                <td class="p-3 text-xs mono text-slate-400">${r.coeff}%</td>
                <td class="p-3 text-sm mono font-bold text-purple-600 dark:text-purple-400">${fmt(b.total)}</td>
                <td class="p-3 text-sm mono font-bold text-teal-600 dark:text-teal-400">${fmt(b.total * iresRate)}</td>
            </tr>`);
    });

    // TOTAL ROW
    if (investments.length > 1) {
        summaryBody.insertAdjacentHTML("beforeend", `
            <tr class="total-row">
                <td class="p-3 text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide" colspan="1">TOTALE</td>
                <td class="p-3 text-sm mono font-black text-slate-800 dark:text-white">${fmt(totalInv)}</td>
                <td class="p-3 text-xs text-slate-400">\u2014</td>
                <td class="p-3 text-sm mono font-black text-purple-600 dark:text-purple-300">${fmt(totalBonus)}</td>
                <td class="p-3 text-sm mono font-black text-teal-600 dark:text-teal-300">${fmt(totalBonus * iresRate)}</td>
            </tr>`);
    }

    // KPI BOXES
    document.getElementById("ires-base").textContent = fmt(totalInv);
    document.getElementById("ires-total").textContent = fmt(totalInv + totalBonus);
    document.getElementById("ires-net").textContent = fmt(totalBonus);
    document.getElementById("tax-base").textContent = fmt(totalInv * iresRate);
    document.getElementById("tax-total").textContent = fmt((totalInv + totalBonus) * iresRate);
    document.getElementById("tax-net").textContent = fmt(totalBonus * iresRate);

    // BREAKDOWN (su totale investimenti aggregato)
    renderBreakdown([
        { label: "Scaglione 1 (0\u20132.5M)", quota: ts1, rate: "180%", val: tb1, color: "#7B5CE0" },
        { label: "Scaglione 2 (2.5\u201310M)", quota: ts2, rate: "100%", val: tb2, color: "#00C9A7" },
        { label: "Scaglione 3 (10\u201320M)", quota: ts3, rate: "50%", val: tb3, color: "#64748b" }
    ], totalInv);

    // DOUGHNUT CHART
    renderDoughnutChart(tb1, tb2, tb3);

    // AMORT TABS + TABLE
    renderAmortTabs();
    if (investments.length > 0) {
        const inv = investments[activeAmortIndex] || investments[0];
        const b = calcBonus(inv.amount);
        updateAmortTable(inv.amount, b.total, inv.coeff / 100);
    } else {
        document.getElementById("amortTable").innerHTML = "";
    }

    // Save to localStorage
    saveToStorage();
}

function renderBreakdown(data, total) {
    const c = document.getElementById("breakdown-container");
    c.innerHTML = "";
    data.forEach(item => {
        if (item.quota === 0 && total > 0) return;
        const perc = total > 0 ? (item.quota / total * 100) : 0;
        c.insertAdjacentHTML("beforeend", `
            <div class="space-y-1.5">
                <div class="flex justify-between items-end text-[11px] font-semibold">
                    <span class="text-slate-400 uppercase tracking-tight">${escapeHtml(item.label)}</span>
                    <span class="text-slate-600 dark:text-slate-300 mono">${fmt(item.quota)} &times; ${escapeHtml(item.rate)} = <span style="color:${item.color}" class="font-black">${fmt(item.val)}</span></span>
                </div>
                <div class="progress-bar"><div style="width:${perc}%;background:${item.color};height:100%;border-radius:9999px;"></div></div>
            </div>`);
    });
}

// ─── DOUGHNUT CHART (Chart.js) ──────────────────────────────────
function renderDoughnutChart(tb1, tb2, tb3) {
    const ctx = document.getElementById("bonusChart");
    if (!ctx || typeof Chart === "undefined") return;

    const data = [tb1, tb2, tb3];
    const allZero = data.every(v => v === 0);

    if (doughnutChart) {
        doughnutChart.data.datasets[0].data = allZero ? [1] : data;
        doughnutChart.data.labels = allZero ? ["Nessun investimento"] : ["Scaglione 1 (180%)", "Scaglione 2 (100%)", "Scaglione 3 (50%)"];
        doughnutChart.data.datasets[0].backgroundColor = allZero ? ["#e2e8f0"] : ["#7B5CE0", "#00C9A7", "#64748b"];
        doughnutChart.update();
        return;
    }

    doughnutChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: allZero ? ["Nessun investimento"] : ["Scaglione 1 (180%)", "Scaglione 2 (100%)", "Scaglione 3 (50%)"],
            datasets: [{
                data: allZero ? [1] : data,
                backgroundColor: allZero ? ["#e2e8f0"] : ["#7B5CE0", "#00C9A7", "#64748b"],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: "65%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        padding: 16,
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        font: { family: "'DM Sans', sans-serif", size: 11 },
                        color: document.documentElement.classList.contains("dark") ? "#94a3b8" : "#64748b"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return " " + context.label + ": " + fmt(context.parsed);
                        }
                    }
                }
            }
        }
    });
}

// ─── AMORTIZATION TABS (all investments) ────────────────────────
function renderAmortTabs() {
    const container = document.getElementById("amortTabs");
    if (!container) return;
    container.innerHTML = "";

    investments.forEach((inv, i) => {
        const safeDesc = escapeHtml(inv.desc || "Inv. " + (i + 1));
        const btn = document.createElement("button");
        btn.className = "amort-tab" + (i === activeAmortIndex ? " active" : "");
        btn.textContent = safeDesc;
        btn.setAttribute("aria-label", "Mostra ammortamento per " + safeDesc);
        btn.addEventListener("click", () => {
            activeAmortIndex = i;
            renderAmortTabs();
            const b = calcBonus(inv.amount);
            updateAmortTable(inv.amount, b.total, inv.coeff / 100);
        });
        container.appendChild(btn);
    });
}

function updateAmortTable(cost, bonus, coeff) {
    const body = document.getElementById("amortTable");
    body.innerHTML = "";
    if (coeff <= 0) return;
    const years = Math.ceil(1 / coeff) + 1;
    for (let i = 0; i < years; i++) {
        const c = (i === 0 || i === years - 1) ? coeff / 2 : coeff;
        const ammCiv = cost * c;
        const varDim = bonus * c;
        body.insertAdjacentHTML("beforeend", `
            <tr class="hover:bg-slate-50 dark:hover:bg-[#0D1E35] transition-colors">
                <td class="p-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200">Anno ${i + 1} <span class="text-slate-400 font-normal">(${2026 + i})</span></td>
                <td class="p-3.5 text-sm mono text-slate-600 dark:text-slate-300">${fmt(ammCiv)}</td>
                <td class="p-3.5 text-sm mono font-bold text-purple-600 dark:text-purple-400">+ ${fmt(varDim)}</td>
                <td class="p-3.5 text-sm mono font-black text-slate-800 dark:text-white">${fmt(ammCiv + varDim)}</td>
            </tr>`);
    }
}

// ─── PDF EXPORT ─────────────────────────────────────────────────
async function exportPDF() {
    const btn = document.querySelector(".pdf-btn");
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generazione...';
    btn.disabled = true;

    // Clone DOM off-screen to avoid visual flash
    const element = document.getElementById("main-content");
    const clone = element.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = "-9999px";
    clone.style.top = "0";
    clone.style.width = element.offsetWidth + "px";
    clone.style.zIndex = "-1";

    // Force light mode on clone
    const wrapper = document.createElement("div");
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Remove no-print elements from clone
    clone.querySelectorAll(".no-print").forEach(el => el.remove());

    await new Promise(r => setTimeout(r, 200));

    try {
        const { jsPDF } = window.jspdf;
        const canvas = await html2canvas(clone, {
            scale: 1.5,
            useCORS: true,
            logging: false,
            backgroundColor: "#f0f4fb"
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const ratio = canvas.width / canvas.height;
        const imgH = pdfW / ratio;
        let y = 0;

        while (y < imgH) {
            if (y > 0) pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, -y, pdfW, imgH);
            y += pdfH;
        }

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        pdf.save("Iperammortamento_2026_Ingenia_" + dateStr + ".pdf");
        showToast("PDF generato con successo");
    } catch (e) {
        alert("Errore nella generazione del PDF. Riprova.");
        console.error(e);
    }

    wrapper.remove();
    btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Esporta PDF';
    btn.disabled = false;
}

// ─── INIT ───────────────────────────────────────────────────────
document.getElementById("iresRate").addEventListener("input", calculate);

// Load saved data or use defaults
const savedData = loadFromStorage();
if (savedData && savedData.investments && savedData.investments.length > 0) {
    if (savedData.iresRate) document.getElementById("iresRate").value = savedData.iresRate;
    savedData.investments.forEach(inv => addRow(inv.desc, inv.amount, inv.coeff));
    showToast("Dati ripristinati dalla sessione precedente");
} else {
    addRow("Investimento 1", 100000, 20);
}
