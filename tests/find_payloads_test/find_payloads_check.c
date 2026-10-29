#include "normalise.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures;

/* Prints one PASS or FAIL line and counts a failure. */
static void check(const char *name, int ok)
{
    printf("%s %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok)
        failures++;
}

/* Returns the payloads found in text. */
static payload_list payloads_of(const char *text)
{
    payload_list list;
    find_payloads((const unsigned char *)text, strlen(text), &list);
    return list;
}

/* Returns 1 when payload i of list holds exactly text, otherwise 0. */
static int payload_is(const payload_list *list, size_t i, const char *text)
{
    return i < list->count && list->len[i] == strlen(text) && memcmp(list->data[i], text, list->len[i]) == 0;
}

/* Checks find_payloads() on wrapped, nested, whole-file and plain inputs. */
int main(void)
{
    const char *inner = "require('child_process').exec('id');";
    payload_list a = payloads_of(
        "eval(Buffer.from(\"cmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWMoJ2lkJyk7\",\"base64\").toString());\n");
    check("a base64 eval wrapper yields the hidden code", a.count == 1 && payload_is(&a, 0, inner));
    free_payloads(&a);

    payload_list b = payloads_of("cmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWMoJ2lkJyk7\n");
    check("a whole file that is one payload is decoded", b.count == 1 && payload_is(&b, 0, inner));
    free_payloads(&b);

    payload_list c = payloads_of("var h = '726571756972652827636869';\n");
    check("a hex literal is decoded", c.count == 1 && payload_is(&c, 0, "require('chi"));
    free_payloads(&c);

    payload_list d = payloads_of(
        "x('ZXZhbChCdWZmZXIuZnJvbSgiY21WeGRXbHlaU2duWTJocGJHUmZjSEp2WTJWemN5Y3BMbVY0WldNb0oybGtKeWs3IiwiYmFzZTY0IikudG9TdHJpbmcoKSk7');\n");
    check("a nested payload is decoded one level down", d.count == 2 && payload_is(&d, 1, inner));
    free_payloads(&d);

    payload_list e = payloads_of("// 'cmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWMoJ2lkJyk7'\nvar a = 'short';\n");
    check("comments and short strings yield nothing", e.count == 0);
    free_payloads(&e);

    payload_list f = payloads_of("var t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';\n");
    check("a base64 alphabet that decodes to binary is skipped", f.count == 0);
    free_payloads(&f);

    payload_list g = payloads_of(
        "eval(Buffer.from('Y29uc29sZS5sb2coIuC4quC4p+C4seC4quC4lOC4teC4hOC4o+C4seC4miDguKLguLTguJnguJTguLXguJXguYnguK3guJnguKPguLHguJoiKTs=','base64').toString());\n");
    check("a payload of mostly non-ASCII UTF-8 text is decoded", g.count == 1 && g.len[0] == 83);
    free_payloads(&g);

    printf("%d failure(s)\n", failures);
    return failures ? 1 : 0;
}
