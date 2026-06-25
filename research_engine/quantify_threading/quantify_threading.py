import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Load the FPS data from the provided CSV files
fps_sequential = pd.read_csv('./multi_person_csv_sequential/fps_sequential.csv')
fps_multi_threaded = pd.read_csv('./multi_person_csv_multi_thread/fps_multi_threaded.csv')

# Align the data by trimming to the desired length for comparison
min_length = 180
fps_sequential = fps_sequential[80:min_length]
fps_multi_threaded = fps_multi_threaded[80:min_length]

# Set up the aesthetics for a premium, polished look
sns.set_theme(style='whitegrid')
plt.figure(figsize=(16, 10))

# Create color palette and gradients for smoother visuals
sequential_color = '#4169E1'  # Royal blue for Sequential FPS
multi_thread_color = '#FF6347'  # Tomato orange for Multi-Threaded FPS

# Plot FPS data with smoother lines, markers, and added transparency for depth
plt.plot(fps_sequential['frame'], fps_sequential['fps'], label='Sequential ROIs FPS',
         color=sequential_color, linestyle='-', marker='o', markersize=7, linewidth=2.5, alpha=0.9)
plt.plot(fps_multi_threaded['frame'], fps_multi_threaded['fps'], label='Multi-Threaded ROIs FPS',
         color=multi_thread_color, linestyle='--', marker='s', markersize=7, linewidth=2.5, alpha=0.9)

# Adding a subtle fill between the two plots to emphasize the difference visually
plt.fill_between(fps_sequential['frame'], fps_sequential['fps'], fps_multi_threaded['fps'],
                 where=(fps_sequential['fps'] > fps_multi_threaded['fps']), interpolate=True,
                 color='#90EE90', alpha=0.4, label='Sequential Higher FPS Zone')
plt.fill_between(fps_sequential['frame'], fps_sequential['fps'], fps_multi_threaded['fps'],
                 where=(fps_sequential['fps'] < fps_multi_threaded['fps']), interpolate=True,
                 color='#FFD700', alpha=0.4, label='Multi-Threaded Higher FPS Zone')

# Add title and labels with custom font styling
plt.title('💡 FPS Comparison: Sequential vs Multi-Threaded ROIs Processing 💡',
          fontsize=20, fontweight='bold', color='#333', pad=20)
plt.xlabel('Frame Number', fontsize=16, fontweight='bold', labelpad=10)
plt.ylabel('Frames Per Second (FPS)', fontsize=16, fontweight='bold', labelpad=10)

# Add enhanced x-ticks and y-ticks for better readability
plt.xticks(range(80, min_length, 10), fontsize=13, fontweight='bold')
plt.yticks(fontsize=13, fontweight='bold')

# Customize legend with shadows, rounded corners, and transparency
plt.legend(loc='upper right', fontsize=14, frameon=True, fancybox=True, shadow=True, borderpad=1.2)

# Add a caption for additional context
plt.figtext(0.5, 0.01, 'Performance zones highlight areas where Sequential or Multi-Threaded FPS dominates.',
            wrap=True, horizontalalignment='center', fontsize=12, color='#555')

# Customize grid with dashed lines and light alpha for subtlety
plt.grid(True, linestyle='--', linewidth=0.5, alpha=0.6)

# Show plot with tight layout for optimal spacing
plt.tight_layout()
plt.show()
