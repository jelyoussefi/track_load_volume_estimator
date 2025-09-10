#!/usr/bin/env python3
"""
Image Copy and Convert Script
Copies images from source folder to destination folder, converting them to JPG format
and renaming them with sequential numbering (image_0001.jpg, image_0002.jpg, etc.)
"""

import os
import re
from pathlib import Path
from PIL import Image
import argparse

def get_next_image_number(dest_folder):
    """
    Find the highest existing image number in the destination folder
    and return the next number to use.
    """
    if not os.path.exists(dest_folder):
        return 1
    
    pattern = re.compile(r'^image_(\d{4})\.jpg$', re.IGNORECASE)
    max_num = 0
    
    for filename in os.listdir(dest_folder):
        match = pattern.match(filename)
        if match:
            num = int(match.group(1))
            max_num = max(max_num, num)
    
    return max_num + 1

def is_image_file(filepath):
    """Check if file is a supported image format."""
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.tif', '.webp'}
    return Path(filepath).suffix.lower() in image_extensions

def convert_and_copy_image(source_path, dest_path):
    """
    Convert image to JPG format and save to destination.
    Handles various input formats and converts them to RGB JPG.
    """
    try:
        with Image.open(source_path) as img:
            # Convert to RGB if necessary (handles PNG with transparency, etc.)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create white background for transparent images
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Save as JPG with high quality
            img.save(dest_path, 'JPEG', quality=95, optimize=True)
            return True
    except Exception as e:
        print(f"Error processing {source_path}: {str(e)}")
        return False

def copy_and_convert_images(source_folder, dest_folder):
    """
    Main function to copy and convert all images from source to destination folder.
    """
    # Validate source folder
    if not os.path.exists(source_folder):
        print(f"Error: Source folder '{source_folder}' does not exist.")
        return False
    
    # Create destination folder if it doesn't exist
    os.makedirs(dest_folder, exist_ok=True)
    
    # Get starting number
    start_num = get_next_image_number(dest_folder)
    current_num = start_num
    
    # Get all image files from source folder
    source_path = Path(source_folder)
    image_files = [f for f in source_path.iterdir() 
                   if f.is_file() and is_image_file(f)]
    
    if not image_files:
        print(f"No image files found in '{source_folder}'.")
        return True
    
    # Sort files for consistent ordering
    image_files.sort(key=lambda x: x.name.lower())
    
    print(f"Found {len(image_files)} image files to process.")
    print(f"Starting numbering from image_{current_num:04d}.jpg")
    print(f"Destination folder: {dest_folder}")
    print()
    
    processed_count = 0
    
    # Process each image file
    for source_file in image_files:
        dest_filename = f"image_{current_num:04d}.jpg"
        dest_path = os.path.join(dest_folder, dest_filename)
        
        print(f"Processing: {source_file.name} -> {dest_filename}")
        
        if convert_and_copy_image(source_file, dest_path):
            processed_count += 1
            current_num += 1
        else:
            print(f"  Failed to process {source_file.name}")
    
    print(f"\nCompleted! Successfully processed {processed_count} out of {len(image_files)} images.")
    return True

def main():
    parser = argparse.ArgumentParser(description='Copy and convert images with sequential numbering')
    parser.add_argument('source', help='Source folder containing images')
    parser.add_argument('destination', help='Destination folder for converted images')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be done without actually copying files')
    
    args = parser.parse_args()
    
    if args.dry_run:
        print("DRY RUN MODE - No files will be copied")
        print(f"Source: {args.source}")
        print(f"Destination: {args.destination}")
        
        if os.path.exists(args.source):
            source_path = Path(args.source)
            image_files = [f for f in source_path.iterdir() 
                          if f.is_file() and is_image_file(f)]
            image_files.sort(key=lambda x: x.name.lower())
            
            start_num = get_next_image_number(args.destination)
            print(f"Would start numbering from: image_{start_num:04d}.jpg")
            print(f"Files to process: {len(image_files)}")
            
            for i, source_file in enumerate(image_files):
                dest_filename = f"image_{start_num + i:04d}.jpg"
                print(f"  {source_file.name} -> {dest_filename}")
        else:
            print(f"Source folder '{args.source}' does not exist.")
    else:
        copy_and_convert_images(args.source, args.destination)

if __name__ == "__main__":
    main()

# Example usage if running as a module:
# copy_and_convert_images("/path/to/source/folder", "/path/to/destination/folder")
