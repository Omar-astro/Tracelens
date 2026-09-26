# Stage 3 — AST Control-Flow Pre-Pass: Building It From Pieces

This walks through the `ast` module techniques `build_flow_index` needs,
one at a time. Every snippet here was actually run — the outputs are
real. Nothing in here is the final function; the last section is a
skeleton with the pieces named but not wired together, so assembling it
is still yours to do.

Test sample used throughout (stand-in for your Appendix C file — swap in
the real one once you're testing against it):

```python
sample = '''
def process(users):
    total = 0
    for u in users:
        if len(u) > 0:
            total += 1
        elif u is None:
            total += 0
    return total
'''
```

---

## Piece 1 — Parsing source into a tree

```python
import ast
tree = ast.parse(sample)
```

`tree` is a `Module` node — the root of the whole program. Everything
else in this guide is about navigating *down* from it.

---

## Piece 2 — Walking the tree and filtering by node type

`ast.walk(tree)` gives you every node in the tree, flattened, in no
particular guaranteed traversal order relative to siblings — but every
`For`/`While`/`If` in the program *will* show up in it exactly once.
Filter with `isinstance`:

```python
for node in ast.walk(tree):
    if isinstance(node, (ast.For, ast.While, ast.If)):
        print(type(node).__name__, "at line", node.lineno)
```

**Output:**
```
For at line 4
If at line 5
If at line 7
```

Notice there are **two** `If` nodes, not one — that `elif` shows up as
its own `If`. More on why in Piece 6.

---

## Piece 3 — Line-number attributes on any node

Every node with a source position carries these:

```python
for_node = next(n for n in ast.walk(tree) if isinstance(n, ast.For))
print(for_node.lineno)       # 4  -- the `for` line itself
print(for_node.end_lineno)   # 8  -- last line covered by this whole loop, body included
```

`end_lineno` (Python 3.8+) is what makes "body line range" easy — it's
already computed for you by the parser, no manual scanning required.

---

## Piece 4 — Telling loop headers from their body

A `For`/`While`/`If` node's `.body` is just a **list of statement
nodes** — the parser has already grouped "what's inside" for you:

```python
print(for_node.body[0].lineno)              # 5  -- first line of the body
print(for_node.body[-1].lineno)             # 5  -- first line of the LAST top-level body stmt
print(for_node.body[-1].end_lineno)         # 8  -- but that stmt's own end_lineno reaches further
```

Notice `body[-1].lineno` (5) and `for_node.end_lineno` (8) disagree —
that's because the loop's only top-level body statement is an `if`, and
that `if` itself spans lines 5–8 (it has an `elif`). If you want "where
does the loop body end," `for_node.end_lineno` is the direct answer;
`body[-1].end_lineno` gets you there too but only because it happens to
be the last thing in the block. Decide which one your `FlowIndex`
actually wants to record — they can differ in trickier code (e.g. a
comment or blank line after the loop wouldn't affect either, but a
`return` right after an `if/elif` inside the loop would).

---

## Piece 5 — Extracting a loop's target variable(s)

`for_node.target` is itself a small AST subtree — usually a single
`ast.Name`, but tuple-unpacking (`for k, v in d.items():`) makes it an
`ast.Tuple` containing multiple `Name` nodes. Rather than special-casing
each shape, walk the target subtree and just collect every `Name`:

```python
def names_in_target(target_node):
    return [n.id for n in ast.walk(target_node) if isinstance(n, ast.Name)]

print(names_in_target(for_node.target))
# ['u']

tuple_sample = ast.parse("for k, v in d.items():\n    pass\n")
for_tuple = next(n for n in ast.walk(tuple_sample) if isinstance(n, ast.For))
print(names_in_target(for_tuple.target))
# ['k', 'v']
```

This one helper handles `for u in x`, `for k, v in x`, and even nested
unpacking (`for (a, (b, c)) in x`) without extra code, because
`ast.walk` doesn't care how deep the `Name` nodes are buried.

### Decision point: `ast.While` has no target at all

```python
w = ast.parse("while x < 10:\n    x += 1\n")
while_node = next(n for n in ast.walk(w) if isinstance(n, ast.While))
print(while_node._fields)       # ('test', 'body', 'orelse')
print(hasattr(while_node, "target"))  # False
```

The spec groups `For` and `While` together under "target variable
name(s)," but a `while` loop has no loop variable in the AST sense — it
has a `.test` (condition) instead, structurally identical to an `If`'s
condition. You have two reasonable choices, and the spec as written
doesn't pick one for you:
- Store `target_vars: []` for every `While` (honest, but not very useful
  downstream).
- Reuse the "names referenced in an expression" trick from Piece 5 on
  `while_node.test` instead, giving you the variable(s) the loop's
  condition depends on (`['x']` here) — arguably more useful for a
  tracer that wants to highlight what's driving the loop.

Pick one before you write `build_flow_index` — it changes what
`LoopInfo` needs to hold for `While` vs `For`.

---

## Piece 6 — Getting a branch's raw condition source text

The spec wants the actual source string of the condition (e.g.
`"len(u) > 0"`), not a re-serialized approximation. `ast.get_source_segment`
does exactly this — give it the **original source string** (not the
tree) and any node with valid position info, and it slices the exact
original text back out, whitespace and all:

```python
if_nodes = [n for n in ast.walk(tree) if isinstance(n, ast.If)]
for n in if_nodes:
    cond_src = ast.get_source_segment(sample, n.test)
    print(f"line {n.lineno}: condition = {cond_src!r}")
```

**Output:**
```
line 5: condition = 'len(u) > 0'
line 7: condition = 'u is None'
```

This is why you should keep the original `code: str` argument around
inside `build_flow_index` rather than working purely off the parsed
tree — `get_source_segment` needs it.

### Why there were two `If` nodes, not one

```python
outer_if = if_nodes[0]
print([type(x).__name__ for x in outer_if.orelse])
# ['If']
```

Python's grammar has no separate "elif" AST node — `elif` is just
sugar for an `If` nested inside the previous `If`'s `.orelse` list.
`ast.walk` flattens that nesting automatically, so your `if len(u) > 0`
and the `elif u is None` both surface as independent `ast.If` nodes with
their own `lineno`, with no extra code needed to "unwrap" the elif
chain. Worth knowing so you don't accidentally write logic assuming a
`.orelse` is always a plain `else` block — check `isinstance(x, ast.If)`
inside `orelse` if you ever need to tell "elif" apart from "else" versus
"no else at all" (empty list).

---

## Piece 7 — Shaping the result

The spec asks for two dicts keyed by line number. A small `dataclass`
per entry keeps the shape self-documenting instead of passing around
bare tuples or dicts-of-dicts:

```python
from dataclasses import dataclass

@dataclass
class LoopInfo:
    header_line: int
    body_start_line: int
    body_end_line: int
    target_vars: list[str]

@dataclass
class BranchInfo:
    header_line: int
    condition_source: str
    body_entry_line: int

@dataclass
class FlowIndex:
    loops: dict[int, LoopInfo]
    branches: dict[int, BranchInfo]
```

This is just structure, not logic — it doesn't decide anything the
spec left open (like the `While`/target question above), it just gives
you somewhere to put the answer once you've decided.

---

## Assembling it — skeleton only

The pieces above map onto `build_flow_index` roughly like this. This is
deliberately not filled in — it's the shape, so you can see where each
piece from above slots in without me writing the logic for you:

```python
def build_flow_index(code: str) -> FlowIndex:
    tree = ast.parse(code)          # Piece 1
    loops = {}
    branches = {}

    for node in ast.walk(tree):     # Piece 2
        if isinstance(node, (ast.For, ast.While)):
            # Piece 3/4: node.lineno, node.end_lineno, node.body[...]
            # Piece 5: names_in_target(...) or names in node.test for While
            # loops[node.lineno] = LoopInfo(...)
            pass
        elif isinstance(node, ast.If):
            # Piece 6: ast.get_source_segment(code, node.test)
            # branches[node.lineno] = BranchInfo(...)
            pass

    return FlowIndex(loops=loops, branches=branches)
```

---

## Checking your own work (no pytest needed yet)

Before wiring up `tests/test_ast_flow.py`, the fastest sanity check is
just running it against your real sample and eyeballing the dicts:

```python
if __name__ == "__main__":
    result = build_flow_index(open("teammate_pipeline.py").read())
    for line, info in result.loops.items():
        print(line, info)
    for line, info in result.branches.items():
        print(line, info)
```

If the loop's `target_vars` shows `['record']` and each branch's
`condition_source` matches the exact text from the file, the two
Definition-of-Done checks in the spec are satisfied — formal `pytest`
assertions on top of that are just codifying what you already verified
by eye.
