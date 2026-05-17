import kagglehub

# Download latest version
print("Starting download of competition files...")
path = kagglehub.competition_download('gemma-4-good-hackathon')
print("Download Complete!")
print("Path to competition files:", path)
