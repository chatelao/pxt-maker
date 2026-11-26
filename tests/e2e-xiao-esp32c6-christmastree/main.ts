christmasTree.initTree(TreeType.PCB, 255, true)

// Frame 1: TwinkleFOX (Holly + FairyLight) + Ice Star Tip (LED 55)
christmasTree.renderTwinkleTreeAt(15350, TreePalette.Holly, TreePalette.FairyLight, 4, 6, christmasTree.treeColor(TreeColor.BgDarkGreen))
const iceTip = christmasTree.colorFromPalette(TreePalette.Ice, 220, 255, true)
christmasTree.setVirtualSegmentPixel(VirtualTreeSegment.StarOuter, 2, iceTip)
const distLut = christmasTree.buildEpicenterDistanceLut(TreeEpicenter.Star)
christmasTree.show()
serial.writeLine("XMAS FRAME1 PCB DIST=" + distLut.length)

// Frame 2: Holz mapping (logical LED 18 -> physical WS2811/WS2812B index 31)
christmasTree.setTreeType(TreeType.Holz)
christmasTree.clear()
christmasTree.setPixel(18, 0xff0000)
christmasTree.show()
serial.writeLine("XMAS FRAME2 HOLZ")

// Frame 3: Read-Modify-Write fadeAll(128) on uncorrected shadow buffer
christmasTree.fadeAll(128)
christmasTree.show()
serial.writeLine("XMAS FRAME3 FADE=" + christmasTree.getPixel(18))

// Interactive Button A (D5) handler
christmasTree.onButtonPressed(TreeButton.A, () => {
    serial.writeLine("XMAS BTN_A")
})
