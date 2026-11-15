import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import App from './App';
describe('BOTVEX Control Center shell',()=>{it('shows app brand and main navigation',()=>{render(<App/>);expect(screen.getAllByText('BOTVEX')[0]).toBeInTheDocument();expect(screen.getByRole('button',{name:/Клиенты/i})).toBeInTheDocument();});});
