package main

import (
	"archive/zip"
	"bufio"
	"io"
	"os"
	"strings"
)

// FilterFunc tells whether some line should be kept:
// true: keep
// false: skip
type FilterFunc func(string) bool

type lineFilterReader struct {
	// bl is the buffer line
	bl         string
	s          *bufio.Scanner
	filterLine FilterFunc
	eof        error
}

func (fr *lineFilterReader) Read(p []byte) (n int, err error) {
	if fr.eof != nil {
		return 0, io.EOF
	}

	scanDone := false
	s := fr.s
	for {
		if len(fr.bl) >= len(p) {
			break
		}
		if !s.Scan() {
			scanDone = true
			break
		}
		if fr.filterLine(s.Text()) {
			fr.bl = strings.Join([]string{fr.bl, s.Text() + "\n"}, "")
		}
	}

	if scanDone {
		if err := s.Err(); err != nil {
			return 0, err
		}
		fr.eof = io.EOF
	}

	copiedN := copy(p, fr.bl)
	fr.bl = fr.bl[copiedN:]

	return copiedN, fr.eof
}

// NewLineFilterReader build a line filter reader
func NewLineFilterReader(r io.Reader, filterLine FilterFunc) io.Reader {
	return &lineFilterReader{
		s:          bufio.NewScanner(r),
		filterLine: filterLine,
	}
}

func main() {
	// 1. build filterReader
	// use srcReader to similuate the source file
	srcR := strings.NewReader(strings.Repeat("1\n2\n3\n", 10))
	filterLine := func(s string) bool {
		return !strings.Contains(s, "2")
	}
	filterR := NewLineFilterReader(srcR, filterLine)

	// 2. build zipReader
	pr, pw := io.Pipe()
	zipW := zip.NewWriter(pw)
	zipF, _ := zipW.Create("123.txt")
	go func() {
		io.Copy(zipF, filterR)
		zipW.Close()
		pw.Close()
	}()

	// zipFile is used to simulate the receiver
	// it may be a http body in prod
	zipFileName := "stream_reading.zip"
	zipFile, _ := os.Create(zipFileName)
	defer os.Remove(zipFileName)
	io.Copy(zipFile, pr)
	zipFile.Close()

	// now we will check the compressed contents in buf
	zipR, _ := zip.OpenReader(zipFileName)
	contentR, _ := zipR.File[0].Open()
	io.Copy(os.Stdout, contentR)
}
