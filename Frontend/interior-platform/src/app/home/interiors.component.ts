import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  SPACES,
  SHOWCASE,
  type HomeDestination,
} from './home-data';

@Component({
  selector: 'app-interiors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './interiors.component.html',
  styleUrl: './interiors.component.css',
})
export class InteriorsComponent {
  /** Requests the shell to switch to an existing view. No routing. */
  navigate = output<HomeDestination>();

  spaces = SPACES;
  showcase = SHOWCASE;

  go(d: HomeDestination): void {
    this.navigate.emit(d);
  }
}
