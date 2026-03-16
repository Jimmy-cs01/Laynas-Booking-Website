import os
import shutil
from send2trash import send2trash


def get_existing(images_dir: str, prefix: str) -> dict:
    existing = {}
    for fname in os.listdir(images_dir):
        name, ext = os.path.splitext(fname)
        if ext.lower() not in ('.jpg', '.jpeg'):
            continue
        if not name.startswith(prefix):
            continue
        num_part = name[len(prefix):]
        if num_part.isdigit():
            existing[int(num_part)] = fname
    return existing


def insert_image(images_dir: str, prefix: str, new_image_path: str, insert_at: int):
    existing = get_existing(images_dir, prefix)

    if not existing:
        print(f"No files found with prefix '{prefix}' in '{images_dir}'.")
        return

    max_num = max(existing.keys())

    if insert_at < 1 or insert_at > max_num + 1:
        print(f"Error: insert_at must be between 1 and {max_num + 1}.")
        return

    for num in range(max_num, insert_at - 1, -1):
        if num not in existing:
            continue
        old_name = existing[num]
        old_ext  = os.path.splitext(old_name)[1]
        new_name = f"{prefix}{num + 1}{old_ext}"
        os.rename(
            os.path.join(images_dir, old_name),
            os.path.join(images_dir, new_name)
        )
        print(f"  Renamed: {old_name} → {new_name}")

    new_ext   = os.path.splitext(new_image_path)[1]
    dest_name = f"{prefix}{insert_at}{new_ext}"
    shutil.copy2(new_image_path, os.path.join(images_dir, dest_name))
    print(f"  Inserted: {os.path.basename(new_image_path)} → {dest_name}")


def delete_image(images_dir: str, prefix: str, delete_num: int):
    existing = get_existing(images_dir, prefix)

    if not existing:
        print(f"No files found with prefix '{prefix}' in '{images_dir}'.")
        return

    max_num = max(existing.keys())

    if delete_num not in existing:
        print(f"Error: '{prefix}{delete_num}.jpeg' does not exist.")
        return

    target = existing[delete_num]
    send2trash(os.path.join(images_dir, target))
    print(f"  Deleted: {target}")

    for num in range(delete_num + 1, max_num + 1):
        if num not in existing:
            continue
        old_name = existing[num]
        old_ext  = os.path.splitext(old_name)[1]
        new_name = f"{prefix}{num - 1}{old_ext}"
        os.rename(
            os.path.join(images_dir, old_name),
            os.path.join(images_dir, new_name)
        )
        print(f"  Renamed: {old_name} → {new_name}")


def main():
    print("=== Image Sequence Manager ===\n")

    images_dir = os.path.dirname(os.path.abspath(__file__))
    prefix = "style"

    # Action
    while True:
        action = input("Action — insert or delete? ").strip().lower()
        if action in ("insert", "delete"):
            break
        print("  Please type 'insert' or 'delete'.")

    if action == "insert":
        while True:
            fname = input("New image filename: ").strip()
            new_image = os.path.join(images_dir, fname)
            if os.path.isfile(new_image):
                break
            print(f"  Error: '{fname}' not found in the images folder. Try again.")

        while True:
            try:
                insert_at = int(input("Insert at number: ").strip())
                break
            except ValueError:
                print("  Please enter a valid integer.")

        print()
        insert_image(images_dir, prefix, new_image, insert_at)

    elif action == "delete":
        while True:
            try:
                delete_num = int(input("Delete number: ").strip())
                break
            except ValueError:
                print("  Please enter a valid integer.")

        print()
        delete_image(images_dir, prefix, delete_num)

    print("\nDone.")


if __name__ == "__main__":
    main()