import sys
d = sys.argv[1]
open(f"{d}/escapes.txt", "wb").write(b'say "hi" \\ path\ttab\r\nnext\x00nul\x01\x1f\x7fdel\n')
open(f"{d}/utf8_valid.txt", "wb").write("café € \U0001F600 مرحبا\n".encode())
open(f"{d}/utf8_cut_end.txt", "wb").write("ends mid emoji ".encode() + "\U0001F600".encode()[:2])
open(f"{d}/utf8_invalid.txt", "wb").write(b"ff:\xff overlong:\xc0\x80 surrogate:\xed\xa0\x80 above:\xf4\x90\x80\x80 lone_cont:\x80 ok")
