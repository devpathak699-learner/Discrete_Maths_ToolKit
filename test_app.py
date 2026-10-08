"""Headless smoke tests. Run with:  python test_app.py"""
from streamlit.testing.v1 import AppTest

def run(module, edits=None):
    at = AppTest.from_file("app.py", default_timeout=60).run()
    at.sidebar.radio[0].set_value(module).run()
    for kind, idx, val in (edits or []):
        getattr(at, kind)[idx].set_value(val).run()
    assert not at.exception, [e.value for e in at.exception]
    return at

def show(label, at):
    print(f"\n[{label}]")
    for k in ("success", "error", "warning"):
        for el in getattr(at, k):
            print(f"  {k}: {el.value[:90]}")

show("Logic default (p->q vs ~p|q)", run("Logic Analyzer"))
show("Logic non-equivalent", run("Logic Analyzer", [("text_input", 1, "p & q")]))
show("Logic bad syntax", run("Logic Analyzer", [("text_input", 0, "p & & (q")]))
show("Logic bad char", run("Logic Analyzer", [("text_input", 0, "p $ q")]))
show("Logic De Morgan", run("Logic Analyzer", [("text_input", 0, "~(p & q)"), ("text_input", 1, "~p | ~q")]))
show("Relation equivalence", run("Relation Checker"))
show("Relation poset", run("Relation Checker", [("text_input", 1, "(1,1),(2,2),(3,3),(4,4),(1,2),(1,3),(2,3)")]))
show("Relation bad element", run("Relation Checker", [("text_input", 1, "(1,9)")]))
show("Relation garbage", run("Relation Checker", [("text_input", 1, "hello")]))
show("Graph default / original", run("Graph Visualizer"))
at = run("Graph Visualizer"); at.radio[0].set_value("Highlight Shortest Path").run()
assert not at.exception; show("Graph shortest A->F", at)
at.radio[0].set_value("Highlight Minimum Spanning Tree").run()
assert not at.exception; show("Graph MST", at)
show("Graph bad line", run("Graph Visualizer", [("text_area", 0, "A B x")]))
show("Graph empty", run("Graph Visualizer", [("text_area", 0, "")]))
at = run("Graph Visualizer", [("text_area", 0, "A B 1\nC D 2")]); at.radio[0].set_value("Highlight Shortest Path").run()
show("Graph disconnected", at)
print("\nALL TESTS RAN WITHOUT UNCAUGHT EXCEPTIONS")
