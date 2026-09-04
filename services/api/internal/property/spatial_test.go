package property

import "testing"

func TestNormalizeKuulaShareURL(t *testing.T) {
	got, err := NormalizeKuulaShareURL(" https://kuula.co/share/LTPpc?fs=1&vr=0#room ")
	if err != nil || got != "https://kuula.co/share/LTPpc?fs=1&vr=0" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestNormalizeKuulaShareURLRejectsNonEmbedAndUnknownHosts(t *testing.T) {
	for _, value := range []string{"https://kuula.co/post/LTPpc", "https://example.com/share/LTPpc", "http://kuula.co/share/LTPpc"} {
		if _, err := NormalizeKuulaShareURL(value); err == nil {
			t.Fatalf("accepted unsafe URL %q", value)
		}
	}
}
