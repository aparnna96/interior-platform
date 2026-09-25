import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-room-visualizer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './room-visualizer.component.html',
  styleUrl: './room-visualizer.component.css',
})
export class RoomVisualizerComponent {
  @Input() wall = '#ece4d4';
  @Input() floor = '#c9a87c';
  @Input() fabric = '#e9ddd0';
  @Input() accent = '#8c6b4a';
  @Input() light: 'day' | 'evening' | 'night' = 'day';
  @Input() room = 'Living Room';
}
