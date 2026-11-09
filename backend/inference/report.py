"""Session report: heart rate vs baseline, fear and affect over time -> summary dict, CSV, PNG chart.

A session is one Calibration plus every HeartRateSample and Prediction recorded against it.
Time is measured in seconds from calibration.recorded_at (the start of the calm recording).
"""
import csv
import io

import numpy as np

from . import conf

# Chart palette: validated categorical slots 1-2 + recessive chrome (light surface).
SURFACE, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
GRID, AXIS, CALIB_FILL, BAND = "#e1e0d9", "#c3c2b7", "#f0efec", "#cde2fb"
BLUE, ORANGE = "#2a78d6", "#eb6834"

CSV_COLUMNS = ["seconds", "timestamp", "kind", "bpm", "hr_baseline_bpm", "hr_delta_bpm",
               "p_fear", "p_fear_smoothed", "fear_state", "valence", "arousal"]


def _seconds(calib, ts):
    return (ts - calib.recorded_at).total_seconds()


def elevated_threshold(calib):
    """bpm above which a session sample counts as elevated: baseline + max(2 SD, 5 bpm)."""
    if calib.baseline_hr_mean is None:
        return None
    return calib.baseline_hr_mean + max(2 * (calib.baseline_hr_std or 0.0), 5.0)


def _weighted_mean(values, weights):
    return float(np.average(values, weights=weights)) if len(values) else None


def summary(calib):
    hr = list(calib.heart_rate.values_list("timestamp", "bpm", "is_baseline"))
    session = np.array([bpm for _, bpm, is_base in hr if not is_base])
    base = calib.baseline_hr_mean
    thr = elevated_threshold(calib)
    preds = list(calib.predictions.order_by("recorded_at"))
    w = [p.n_windows for p in preds]

    times = [calib.recorded_at] + [t for t, _, _ in hr] + [p.recorded_at for p in preds]
    heart_rate = None
    if hr:
        heart_rate = {
            "baseline_mean_bpm": base,
            "baseline_std_bpm": calib.baseline_hr_std,
            "n_baseline_samples": sum(1 for *_, is_base in hr if is_base),
            "n_session_samples": int(len(session)),
            "session_mean_bpm": float(session.mean()) if len(session) else None,
            "session_min_bpm": float(session.min()) if len(session) else None,
            "session_max_bpm": float(session.max()) if len(session) else None,
            "mean_delta_bpm": float(session.mean() - base) if len(session) and base is not None else None,
            "max_delta_bpm": float(session.max() - base) if len(session) and base is not None else None,
            "elevated_threshold_bpm": thr,
            "pct_samples_elevated": float((session > thr).mean() * 100) if len(session) and thr else None,
        }
    return {
        "session_id": calib.pk,
        "started_at": calib.recorded_at,
        "duration_seconds": max(_seconds(calib, t) for t in times),
        "calibration_seconds": calib.duration_seconds,
        "heart_rate": heart_rate,
        "fear": {
            "n_predictions": len(preds),
            "threshold": conf.get("FEAR_THRESHOLD"),
            "mean_p_fear": _weighted_mean([p.p_fear for p in preds], w),
            "max_p_fear_smoothed": max((p.p_fear_smoothed for p in preds), default=None),
            "pct_windows_fear": _weighted_mean([100.0 * (p.fear_state == "fear") for p in preds], w),
        },
        "affect": {
            "mean_valence": _weighted_mean([p.valence for p in preds], w),
            "mean_arousal": _weighted_mean([p.arousal for p in preds], w),
        },
    }


def csv_text(calib):
    """One time-sorted table: a row per heart-rate sample and a row per prediction (blank cells elsewhere)."""
    base = calib.baseline_hr_mean
    rows = []
    for s in calib.heart_rate.all():
        rows.append({
            "timestamp": s.timestamp, "kind": "hr_baseline" if s.is_baseline else "hr", "bpm": s.bpm,
            "hr_baseline_bpm": base, "hr_delta_bpm": s.bpm - base if base is not None else None,
        })
    for p in calib.predictions.all():
        rows.append({
            "timestamp": p.recorded_at, "kind": "prediction", "p_fear": p.p_fear,
            "p_fear_smoothed": p.p_fear_smoothed, "fear_state": p.fear_state,
            "valence": p.valence, "arousal": p.arousal,
        })
    rows.sort(key=lambda r: r["timestamp"])

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in rows:
        r["seconds"] = round(_seconds(calib, r["timestamp"]), 3)
        r["timestamp"] = r["timestamp"].isoformat()
        writer.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()})
    return buf.getvalue()


def _break_gaps(x, y, max_gap):
    """Insert NaN where samples are further apart than max_gap, so the line doesn't bridge missing data."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    if len(x) < 2:
        return x, y
    cut = np.where(np.diff(x) > max_gap)[0] + 1
    return np.insert(x, cut, np.nan), np.insert(y, cut, np.nan)


def _style(ax, title):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", color=INK, fontsize=10.5, pad=8)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(AXIS)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, labelsize=8.5, length=0)


def _end_labels(ax, series, color, min_gap=0.22):
    """Label each line at its last point; push labels apart vertically when ends are close."""
    ends = []
    for x, y, text in series:
        ok = ~np.isnan(y)
        if ok.any():
            ends.append([x[ok][-1], y[ok][-1], y[ok][-1], text])   # x, anchor y, label y, text
    ends.sort(key=lambda e: e[2])
    for lower, upper in zip(ends, ends[1:]):
        if upper[2] - lower[2] < min_gap:
            mid = (upper[2] + lower[2]) / 2
            lower[2], upper[2] = mid - min_gap / 2, mid + min_gap / 2
    for x, _, label_y, text in ends:
        ax.annotate(text, (x, label_y), xytext=(6, 0), textcoords="offset points", va="center",
                    fontsize=8.5, color=color)


def chart_png(calib):
    """PNG bytes, or None if the session has no heart rate or predictions yet."""
    from matplotlib.figure import Figure   # Figure (not pyplot) is safe in a threaded server

    hr = list(calib.heart_rate.values_list("timestamp", "bpm"))
    preds = list(calib.predictions.order_by("recorded_at"))
    panels = (["hr"] if hr else []) + (["fear", "affect"] if preds else [])
    if not panels:
        return None
    mids = [_seconds(calib, p.recorded_at) + p.duration_seconds / 2 for p in preds]
    gap = max([15.0] + [2.5 * p.duration_seconds for p in preds])

    fig = Figure(figsize=(10, 0.6 + 2.5 * len(panels)), dpi=150, facecolor=SURFACE)
    axes = fig.subplots(len(panels), 1, sharex=True, squeeze=False)[:, 0]
    fig.suptitle(f"Session {calib.pk} · {calib.recorded_at:%Y-%m-%d %H:%M} UTC", x=0.01, ha="left",
                 color=INK, fontsize=12)

    for ax, panel in zip(axes, panels):
        ax.axvspan(0, calib.duration_seconds, color=CALIB_FILL, lw=0, zorder=0)

        if panel == "hr":
            _style(ax, "Heart rate (bpm)")
            x, y = _break_gaps([_seconds(calib, t) for t, _ in hr], [b for _, b in hr], max_gap=10)
            base, sd = calib.baseline_hr_mean, calib.baseline_hr_std or 0.0
            if base is not None:
                ax.axhspan(base - sd, base + sd, color=BAND, alpha=0.55, lw=0, zorder=1)
                ax.axhline(base, color=INK2, lw=1, ls=(0, (4, 3)), zorder=2)
                ax.annotate(f"baseline {base:.0f} bpm", (1, base), xycoords=("axes fraction", "data"),
                            xytext=(6, 0), textcoords="offset points", va="center", fontsize=8.5, color=INK2)
            ax.plot(x, y, color=BLUE, lw=1.6, zorder=3, solid_capstyle="round")

        elif panel == "fear":
            _style(ax, f"P(fear), {conf.get('SMOOTHING_SECONDS')} s smoothed")
            x, y = _break_gaps(mids, [p.p_fear_smoothed for p in preds], max_gap=gap)
            thr = conf.get("FEAR_THRESHOLD")
            ax.axhline(thr, color=INK2, lw=1, ls=(0, (4, 3)), zorder=2)
            ax.annotate(f"fear threshold {thr:g}", (1, thr), xycoords=("axes fraction", "data"),
                        xytext=(6, 0), textcoords="offset points", va="center", fontsize=8.5, color=INK2)
            ax.plot(x, y, color=BLUE, lw=1.6, zorder=3, solid_capstyle="round")
            ax.set_ylim(0, 1)

        else:
            _style(ax, "Valence and arousal vs. calibration (−1 to 1)")
            ax.axhline(0, color=AXIS, lw=1, zorder=2)
            labelled = []
            for key, color, label in (("valence", BLUE, "Valence"), ("arousal", ORANGE, "Arousal")):
                x, y = _break_gaps(mids, [getattr(p, key) for p in preds], max_gap=gap)
                ax.plot(x, y, color=color, lw=1.6, zorder=3, label=label, solid_capstyle="round")
                labelled.append((x, y, label))
            _end_labels(ax, labelled, INK2)
            ax.set_ylim(-1.05, 1.05)
            leg = ax.legend(loc="upper left", frameon=False, fontsize=8.5, ncol=2, handlelength=1.6)
            for t in leg.get_texts():
                t.set_color(INK2)

    axes[0].annotate("calibration", (calib.duration_seconds / 2, 1), xycoords=("data", "axes fraction"),
                     xytext=(0, -10), textcoords="offset points", ha="center", fontsize=8, color=MUTED)
    axes[-1].set_xlabel("Seconds since calibration started", color=MUTED, fontsize=9)
    axes[-1].set_xlim(left=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=SURFACE, bbox_inches="tight")
    return buf.getvalue()
