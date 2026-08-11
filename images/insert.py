import os
import sys

DIRECTORY = "."
EXT = ".jpeg"
PREFIX = "style"

def swap_styles(a, b, directory=DIRECTORY):
    file_a = os.path.join(directory, f"{PREFIX}{a}{EXT}")
    file_b = os.path.join(directory, f"{PREFIX}{b}{EXT}")

    if not os.path.exists(file_a):
        print(f"Error: {file_a} does not exist.")
        return
    if not os.path.exists(file_b):
        print(f"Error: {file_b} does not exist.")
        return

    tmp = os.path.join(directory, f"__tmp_swap{EXT}")
    os.rename(file_a, tmp)
    os.rename(file_b, file_a)
    os.rename(tmp, file_b)
    print(f"Swapped: {PREFIX}{a}{EXT} <-> {PREFIX}{b}{EXT}")

def main():
    print("Style swapper. Press Ctrl+C or type 'q' to quit.")
    while True:
        try:
            raw = input("\nEnter two style numbers to swap (e.g. '2 15'): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

        if raw.lower() in ("q", "quit", "exit"):
            print("Exiting.")
            break

        parts = raw.replace(",", " ").split()
        if len(parts) != 2:
            print("Please enter exactly two numbers, e.g. '2 15'.")
            continue

        try:
            a, b = int(parts[0]), int(parts[1])
        except ValueError:
            print("Both values must be integers.")
            continue

        if a == b:
            print("Numbers are the same, nothing to swap.")
            continue

        swap_styles(a, b)

if __name__ == "__main__":
    main()