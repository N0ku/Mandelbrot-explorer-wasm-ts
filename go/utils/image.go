package utils

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
)

// ImageToBase64 converts image to base64 string
func ImageToBase64(img *image.RGBA) string {
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return base64.StdEncoding.EncodeToString(buf.Bytes())
} 