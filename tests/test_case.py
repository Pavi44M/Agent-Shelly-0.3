"""Case-study mode (v2.5.3): six steps, live numbers, honest about simulated baskets."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_case_page_has_six_steps_and_reads_the_lab():
    html = (ROOT / "docs/case/index.html").read_text(encoding="utf-8")
    assert html.count('class="step"') == 6 and 'data-page="case"' in html and "../data/commercial.js" in html
    assert "simulated" in html and "no employer data" in html
    js = (ROOT / "docs/case/app.js").read_text(encoding="utf-8")
    assert "SHELLY_COMMERCIAL" in js and "totals" in js
