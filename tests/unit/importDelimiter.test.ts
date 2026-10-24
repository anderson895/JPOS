// Unit tests for CSV and text files: what splits the columns (commas,
// semicolons, tabs, bars), decimal commas, and reading the file itself.
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixDecimalComma, guessDelimiter, readTable } from '@/lib/importTable';

test('what splits the columns is found from the lines; quoted text and decimal commas are left out', () => {
  assert.equal(guessDelimiter('Name,Price\nCoke,85\nSprite,80\n'), ',');
  assert.equal(guessDelimiter('Name;Price;Cost\nCoke;85,50;70,00\nSprite;80,00;65,00\n'), ';');
  assert.equal(guessDelimiter('Name\tPrice\nCoke\t85\n'), '\t');
  assert.equal(guessDelimiter('Name|Price\nCoke|85\n'), '|');
  assert.equal(guessDelimiter('Name,Price,Cost\r\nCoke,85,70\r\n'), ',');
  // Excel's own "sep=" line wins
  assert.equal(guessDelimiter('sep=;\nName,Price\nCoke,85\n'), ';');
  // A header with the other character in it
  assert.equal(guessDelimiter('Name,Price (PHP; with VAT)\nCoke,85\nSprite,80\n'), ',');
  assert.equal(guessDelimiter('Name;Price, PHP\nCoke;85,50\n'), ';');
  // A title line first, and separators inside quotes
  assert.equal(guessDelimiter('My store list\nName;Price;Cost\nCoke;85;70\n'), ';');
  assert.equal(guessDelimiter('Name,Price\n"Rice; Dinorado",62\n"Oil; 1L",80\n'), ',');
  // One column only: commas
  assert.equal(guessDelimiter('just names\nCoke\nSprite\n'), ',');
});

test('decimal commas become decimal points; thousands and text stay', () => {
  assert.equal(fixDecimalComma('85,50'), '85.50');
  assert.equal(fixDecimalComma('1.234,50'), '1234.50');
  assert.equal(fixDecimalComma('₱85,5'), '₱85.5');
  assert.equal(fixDecimalComma('(12,50)'), '(12.50)');
  assert.equal(fixDecimalComma('1,500'), '1,500');
  assert.equal(fixDecimalComma('Coke 1,5L'), 'Coke 1,5L');
  assert.equal(fixDecimalComma(85), 85);
  assert.equal(fixDecimalComma(null), null);
});

test('reading CSV and text files: semicolons, tabs, a picked separator, old Windows encoding', async () => {
  const csv = (name: string, text: string | Uint8Array) => new File([text], name);

  const semi = await readTable(csv('list.csv', 'sep=;\nName;Price;Note\nCoke;85,50;"cold; 1.5L"\n'));
  assert.equal(semi.delimiter, ';');
  assert.deepEqual(semi.headers, ['Name', 'Price', 'Note']);
  assert.deepEqual(semi.rows, [['Coke', '85.50', 'cold; 1.5L']]);

  const tabs = await readTable(csv('list.txt', 'Name\tPrice\nCoke\t85\n'));
  assert.equal(tabs.delimiter, '\t');
  assert.deepEqual(tabs.rows, [['Coke', '85']]);

  const commas = await readTable(csv('list.csv', 'Name,Price\n"Rice, Dinorado",62\n'));
  assert.equal(commas.delimiter, ',');
  assert.deepEqual(commas.rows, [['Rice, Dinorado', '62']]);

  // The person picks bars for a file that really uses them
  const picked = await readTable(csv('list.csv', 'Name|Price;Note\nCoke|85;x\n'), { delimiter: '|' });
  assert.deepEqual(picked.headers, ['Name', 'Price;Note']);

  // "Piña" saved by an old Excel (Windows-1252, not UTF-8)
  const old = new Uint8Array([...Buffer.from('Name,Price\nPi'), 0xf1, ...Buffer.from('a,30\n')]);
  assert.deepEqual((await readTable(csv('old.csv', old))).rows, [['Piña', '30']]);

  // A byte-order mark at the start doesn't stick to the first header
  const bom = await readTable(csv('bom.csv', String.fromCharCode(0xfeff) + 'Name,Price\nCoke,85\n'));
  assert.equal(bom.headers[0], 'Name');

  await assert.rejects(readTable(csv('notes.pdf', 'x')), /Use a CSV or Excel file/);
});
