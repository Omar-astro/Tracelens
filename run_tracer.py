import json
import sys
from pathlib import Path
from backend.app.services.sandbox import trace_in_sandbox

def run_script(script_path: str):
    code = Path(script_path).read_text(encoding="utf-8")
    
    # Executes under isolated subprocess + 8s hard timeout + blocked os/socket/open + delta tracer
    result = trace_in_sandbox(code, timeout=8.0)
    
    print(f"=== Execution Status: {result.status.upper()} ===")
    if result.stdout:
        print(f"--- Script Output ---\n{result.stdout.strip()}")
    if result.error:
        print(f"--- Error [{result.error_code}] ---\n{result.error}")
        
    print(f"\n--- Trace Summary ---")
    print(f"Total Steps: {len(result.steps)}")
    
    # Save the full execution JSON trace to disk
    output_file = Path("trace_output.json")
    output_file.write_text(json.dumps(result.to_dict(), indent=2, default=str), encoding="utf-8")
    print(f"Full JSON trace written to {output_file.resolve()}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "test.py"
    run_script(target)